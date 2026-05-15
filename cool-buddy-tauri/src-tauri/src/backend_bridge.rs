use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Condvar, Mutex,
    },
    thread,
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize)]
struct BackendRequest<'a> {
    id: u64,
    method: &'a str,
    args: Value,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum BackendMessage {
    #[serde(rename = "response")]
    Response {
        id: u64,
        result: Option<Value>,
        error: Option<String>,
    },
    #[serde(rename = "event")]
    Event { event: String, payload: Value },
}

#[derive(Default)]
struct PendingResponseState {
    value: Mutex<Option<Result<Value, String>>>,
    signal: Condvar,
}

struct BackendBridgeInner {
    stdin: Mutex<ChildStdin>,
    next_id: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, Arc<PendingResponseState>>>>,
    _child: Mutex<Child>,
}

pub struct BackendBridge {
    inner: Arc<BackendBridgeInner>,
}

fn resolve_backend_script(app: &AppHandle) -> Result<PathBuf, String> {
    let manifest_generated =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("generated").join("node-backend.mjs");

    if manifest_generated.exists() {
        return Ok(manifest_generated);
    }

    let resource_generated = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("generated")
        .join("node-backend.mjs");

    if resource_generated.exists() {
        return Ok(resource_generated);
    }

    Err("Tauri backend host bundle was not found.".to_string())
}

fn resolve_node_executable(app: &AppHandle) -> String {
    let manifest_node = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("generated")
        .join(if cfg!(target_os = "windows") { "node.exe" } else { "node" });

    if manifest_node.exists() {
        return manifest_node.to_string_lossy().into_owned();
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource_node = resource_dir.join("generated").join(if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        });

        if resource_node.exists() {
            return resource_node.to_string_lossy().into_owned();
        }
    }

    std::env::var("COOL_BUDDY_NODE_EXECUTABLE")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "node".to_string())
}

fn reject_all_pending(pending_map: &Mutex<HashMap<u64, Arc<PendingResponseState>>>, message: &str) {
    let mut guard = pending_map.lock().expect("pending response mutex poisoned");
    let pending: Vec<Arc<PendingResponseState>> = guard.drain().map(|(_, value)| value).collect();
    drop(guard);

    for waiter in pending {
        let mut state = waiter.value.lock().expect("pending response state mutex poisoned");
        *state = Some(Err(message.to_string()));
        waiter.signal.notify_all();
    }
}

impl BackendBridge {
    pub fn new(app: AppHandle) -> Result<Self, String> {
        let backend_script = resolve_backend_script(&app)?;
        let node_executable = resolve_node_executable(&app);
        let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
        let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .canonicalize()
            .map_err(|error| error.to_string())?;
        let home_dir = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from)
            .ok_or_else(|| "Failed to resolve home directory for backend host.".to_string())?;

        let mut child = Command::new(node_executable)
            .arg(backend_script)
            .current_dir(workspace_root)
            .env("COOL_BUDDY_TAURI_DATA_DIR", &app_data_dir)
            .env("COOL_BUDDY_TAURI_HOME_DIR", &home_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Failed to launch Node backend host: {error}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to capture Node backend stdin.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture Node backend stdout.".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture Node backend stderr.".to_string())?;

        let inner = Arc::new(BackendBridgeInner {
            stdin: Mutex::new(stdin),
            next_id: AtomicU64::new(1),
            pending: Arc::new(Mutex::new(HashMap::new())),
            _child: Mutex::new(child),
        });

        let stdout_pending = Arc::clone(&inner.pending);
        let stdout_app = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);

            for line in reader.lines() {
                let Ok(line) = line else {
                    reject_all_pending(
                        &stdout_pending,
                        "Node backend host stopped while reading responses.",
                    );
                    return;
                };

                if line.trim().is_empty() {
                    continue;
                }

                match serde_json::from_str::<BackendMessage>(&line) {
                    Ok(BackendMessage::Response { id, result, error }) => {
                        let pending = {
                            let mut pending_map = stdout_pending
                                .lock()
                                .expect("pending response mutex poisoned");
                            pending_map.remove(&id)
                        };

                        if let Some(waiter) = pending {
                            let mut state = waiter
                                .value
                                .lock()
                                .expect("pending response state mutex poisoned");
                            *state = Some(match error {
                                Some(message) => Err(message),
                                None => Ok(result.unwrap_or(Value::Null)),
                            });
                            waiter.signal.notify_all();
                        }
                    }
                    Ok(BackendMessage::Event { event, payload }) => {
                        let _ = stdout_app.emit(&event, payload);
                    }
                    Err(error) => {
                        let _ = stdout_app.emit(
                            "backend:error",
                            serde_json::json!({
                                "message": format!("Failed to parse backend host message: {error}")
                            }),
                        );
                    }
                }
            }

            reject_all_pending(&stdout_pending, "Node backend host connection closed.");
        });

        let stderr_app = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);

            for line in reader.lines() {
                match line {
                    Ok(message) if !message.trim().is_empty() => {
                        let _ = stderr_app.emit(
                            "backend:error",
                            serde_json::json!({ "message": message }),
                        );
                    }
                    Ok(_) => {}
                    Err(error) => {
                        let _ = stderr_app.emit(
                            "backend:error",
                            serde_json::json!({
                                "message": format!("Failed to read backend host stderr: {error}")
                            }),
                        );
                        return;
                    }
                }
            }
        });

        Ok(Self { inner })
    }

    pub fn invoke(&self, method: &str, args: Value) -> Result<Value, String> {
        let request_id = self.inner.next_id.fetch_add(1, Ordering::Relaxed);
        let request = BackendRequest {
            id: request_id,
            method,
            args,
        };
        let request_line =
            serde_json::to_string(&request).map_err(|error| format!("Failed to encode backend request: {error}"))?;
        let pending = Arc::new(PendingResponseState::default());

        {
            let mut pending_map = self
                .inner
                .pending
                .lock()
                .map_err(|_| "Pending response state is poisoned.".to_string())?;
            pending_map.insert(request_id, Arc::clone(&pending));
        }

        let write_result = (|| -> Result<(), String> {
            let mut stdin = self
                .inner
                .stdin
                .lock()
                .map_err(|_| "Backend stdin is poisoned.".to_string())?;
            stdin
                .write_all(request_line.as_bytes())
                .and_then(|_| stdin.write_all(b"\n"))
                .and_then(|_| stdin.flush())
                .map_err(|error| format!("Failed to write backend request: {error}"))
        })();

        if let Err(error) = write_result {
            let mut pending_map = self
                .inner
                .pending
                .lock()
                .map_err(|_| "Pending response state is poisoned.".to_string())?;
            pending_map.remove(&request_id);
            return Err(error);
        }

        let mut state = pending
            .value
            .lock()
            .map_err(|_| "Pending response state is poisoned.".to_string())?;

        while state.is_none() {
            state = pending
                .signal
                .wait(state)
                .map_err(|_| "Pending response wait failed.".to_string())?;
        }

        state
            .take()
            .ok_or_else(|| "Backend response was lost.".to_string())?
    }
}
