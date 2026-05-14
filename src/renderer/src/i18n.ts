import type { Locale } from '../../shared/locale';
import { localizedMessageOverrides } from './i18n-locales';

const baseMessages = {
  'zh-CN': {
    pasteConfirmTitle: '检测到多行粘贴',
    pasteExecuteAll: '整段执行',
    pasteExecuteLineByLine: '逐行执行',
    appName: 'SSH-PRO',
    version: 'v2.4.0-stable',
    searchSessions: '\u641c\u7d22\u4f1a\u8bdd...',
    production: '\u751f\u4ea7\u73af\u5883',
    staging: '\u9884\u53d1\u73af\u5883',
    local: '\u672c\u5730',
    fileExplorer: '\u6587\u4ef6\u6d4f\u89c8',
    newSession: '\u65b0\u5efa\u4f1a\u8bdd',
    host: '\u4e3b\u673a',
    port: '\u7aef\u53e3',
    username: '\u7528\u6237\u540d',
    password: '\u5bc6\u7801',
    connect: '\u8fde\u63a5',
    disconnect: '\u65ad\u5f00',
    splitPane: '\u5206\u5c4f',
    sessionDetails: '\u4f1a\u8bdd\u8be6\u60c5',
    noSessions: '\u8fd8\u6ca1\u6709\u4f1a\u8bdd',
    noSessionsHint:
      '\u5148\u65b0\u5efa\u4e00\u4e2a SSH \u4f1a\u8bdd\uff0c\u8fd9\u4e2a\u5de5\u4f5c\u53f0\u5c31\u4f1a\u6d3b\u8d77\u6765\u3002',
    createSession: '\u65b0\u5efa\u4f1a\u8bdd',
    sessionAuthDescription:
      '\u4fdd\u5b58\u8fd9\u53f0\u4e3b\u673a\u7684\u8ba4\u8bc1\u65b9\u5f0f\uff0c\u4e0b\u6b21\u8fde\u63a5\u65f6\u5c31\u4e0d\u7528\u518d\u4e34\u65f6\u8865\u586b\u3002',
    sessionAuthTitle: '\u8ba4\u8bc1\u65b9\u5f0f',
    sessionAuthHint:
      '\u670d\u52a1\u5668\u8fd8\u5728\u7528\u5bc6\u7801\u5c31\u9009\u5bc6\u7801\uff0c\u5982\u679c\u5df2\u7ecf\u4fe1\u4efb\u4f60\u7684\u516c\u94a5\uff0c\u5c31\u76f4\u63a5\u590d\u7528\u672c\u673a SSH \u5bc6\u94a5\u3002',
    sessionAuthPassword: '\u5bc6\u7801',
    sessionAuthPasswordHint:
      '\u9002\u5408\u8fd8\u9700\u8981\u5bc6\u7801\u767b\u5f55\u7684\u4e3b\u673a\uff0c\u4f1a\u8bdd\u4f1a\u8bb0\u4f4f\u8fd9\u4e2a\u5bc6\u7801\u3002',
    sessionAuthSystemKey: '\u7cfb\u7edf SSH \u5bc6\u94a5',
    sessionAuthSystemKeyHint:
      '\u4f18\u5148\u5c1d\u8bd5\u672c\u673a ssh-agent \u548c ~/.ssh \u4e0b\u7684\u9ed8\u8ba4\u79c1\u94a5\uff0c\u5fc5\u8981\u65f6\u518d\u6307\u5b9a\u7279\u5b9a\u79c1\u94a5\u6587\u4ef6\u3002',
    sessionAgentAvailable: 'Agent \u53ef\u7528',
    sessionAgentUnavailable: '\u672a\u68c0\u6d4b\u5230 Agent',
    sessionDefaultKeyFound: '\u5df2\u627e\u5230\u9ed8\u8ba4\u79c1\u94a5',
    sessionDefaultKeyMissing: '\u672a\u627e\u5230\u9ed8\u8ba4\u79c1\u94a5',
    sessionKeySourceDefault: '\u7cfb\u7edf\u9ed8\u8ba4\u4f4d\u7f6e',
    sessionKeySourceCustom: '\u81ea\u5b9a\u4e49\u79c1\u94a5',
    sessionKeySourceDefaultHint:
      'cool-buddy \u4f1a\u5148\u8bd5\u672c\u673a SSH agent\uff0c\u518d\u8bd5 ~/.ssh \u76ee\u5f55\u4e0b\u7684\u5e38\u89c1\u79c1\u94a5\u3002',
    sessionKeySourceCustomHint:
      '\u5982\u679c\u8fd9\u53f0\u4e3b\u673a\u4f7f\u7528\u975e\u9ed8\u8ba4\u79c1\u94a5\uff0c\u6216\u8005\u4f60\u60f3\u7528\u72ec\u7acb\u7684\u90e8\u7f72\u8eab\u4efd\uff0c\u5c31\u5728\u8fd9\u91cc\u6307\u5b9a\u6587\u4ef6\u3002',
    sessionDefaultKeySummary:
      '\u6682\u65f6\u6ca1\u6709\u68c0\u6d4b\u5230\u53ef\u8bfb\u7684\u9ed8\u8ba4\u79c1\u94a5\uff0c\u4f60\u4ecd\u7136\u53ef\u4ee5\u4f7f\u7528 ssh-agent\uff0c\u6216\u5207\u6362\u4e3a\u81ea\u5b9a\u4e49\u79c1\u94a5\u6587\u4ef6\u3002',
    sessionPrivateKeyPath: '\u79c1\u94a5\u8def\u5f84',
    sessionPrivateKeyPassphrase: '\u79c1\u94a5\u53e3\u4ee4',
    browsePrivateKey: '\u9009\u62e9\u79c1\u94a5',
    createFirstSession: '\u521b\u5efa\u7b2c\u4e00\u4e2a\u4f1a\u8bdd',
    saveSession: '\u4fdd\u5b58\u4f1a\u8bdd',
    sessionName: '\u4f1a\u8bdd\u540d\u79f0',
    sessionGroup: '\u5206\u7ec4',
    cancel: '\u53d6\u6d88',
    loadingSessions: '\u6b63\u5728\u52a0\u8f7d\u4f1a\u8bdd...',
    resourceVitals: '\u8d44\u6e90\u6982\u89c8',
    cpuUsage: 'CPU \u4f7f\u7528\u7387',
    memory: '\u5185\u5b58',
    dockerInstances: 'Docker \u5b9e\u4f8b',
    deviceInfo: '\u8bbe\u5907\u4fe1\u606f',
    metricsDetails: '\u8bbe\u5907\u8be6\u60c5',
    viewDetails: '\u67e5\u770b\u8be6\u60c5',
    deviceSummaryFallback: '\u8fdc\u7a0b\u8bbe\u5907',
    hostname: '\u4e3b\u673a\u540d',
    operatingSystem: '\u7cfb\u7edf',
    kernelVersion: '\u5185\u6838',
    architecture: '\u67b6\u6784',
    uptime: '\u5728\u7ebf\u65f6\u957f',
    running: '\u8fd0\u884c\u4e2d',
    unavailable: '\u6682\u4e0d\u53ef\u7528',
    emptyMetricsTitle: '\u8fd8\u6ca1\u6709\u8fdc\u7a0b\u6307\u6807',
    emptyMetricsHint:
      '\u8fde\u63a5\u5230\u652f\u6301\u547d\u4ee4\u91c7\u96c6\u7684 Linux \u4e3b\u673a\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a CPU\u3001\u5185\u5b58\u548c Docker \u72b6\u6001\u3002',
    aiAgent: 'AI \u52a9\u624b',
    task: '\u4efb\u52a1',
    executedAt: '\u6267\u884c\u65f6\u95f4',
    nextRecommendation: '\u4e0b\u4e00\u6b65\u5efa\u8bae',
    askAi: '\u8ba9 AI \u6267\u884c\u4efb\u52a1...',
    restartService: '\u91cd\u542f\u670d\u52a1',
    checkLogs: '\u68c0\u67e5\u65e5\u5fd7',
    auditPermissions: '\u5ba1\u8ba1\u6743\u9650',
    agentQuickHostHealth: '\u4e3b\u673a\u5065\u5eb7',
    agentQuickRunningApps: '\u8fd0\u884c\u4e2d\u5e94\u7528',
    agentQuickCheckLogs: '\u68c0\u67e5\u65e5\u5fd7',
    agentQuickHostHealthPrompt:
      '\u68c0\u67e5\u5f53\u524d\u7cfb\u7edf\u6307\u6807\uff0c\u5e76\u603b\u7ed3\u8fd9\u53f0\u4e3b\u673a\u7684\u5065\u5eb7\u72b6\u51b5\u3002',
    agentQuickRunningAppsPrompt:
      '\u68c0\u67e5\u6b63\u5728\u8fd0\u884c\u7684\u670d\u52a1\u4e0e\u5bb9\u5668\uff0c\u5e76\u603b\u7ed3\u662f\u5426\u5b58\u5728\u660e\u663e\u95ee\u9898\u3002',
    agentQuickCheckLogsPrompt:
      '\u8bfb\u53d6\u4e00\u4e2a\u6709\u4ef7\u503c\u7684\u5e94\u7528\u65e5\u5fd7\u6700\u65b0 80 \u884c\uff0c\u5e76\u603b\u7ed3\u5f02\u5e38\u70b9\u3002',
    keyBindings: '\u5feb\u6377\u952e',
    keyBindingsHint:
      '\u4e0b\u9762\u662f\u5f53\u524d\u7ec8\u7aef\u5de5\u4f5c\u53f0\u652f\u6301\u7684\u5e38\u7528\u5feb\u6377\u952e\u793a\u4f8b\u3002',
    quickActions: '\u5feb\u6377\u64cd\u4f5c',
    terminalSettings: '\u7ec8\u7aef\u8bbe\u7f6e',
    agentSettingsTitle: 'Agent \u8bbe\u7f6e',
    agentSettingsHint:
      '\u5148\u914d\u7f6e\u5927\u6a21\u578b\u5382\u5546\u3001URL \u4e0e Key\uff0c\u540e\u7eed\u518d\u628a AI Agent \u8fde\u63a5\u8fdb\u6765\u3002',
    agentSettingsCategoryProvider: '\u5927\u6a21\u578b\u5382\u5546',
    agentProviderLabel: '\u5382\u5546',
    agentProviderUrlLabel: 'Base URL',
    agentProviderKeyLabel: 'API Key',
    agentProviderModelLabel: '模型',
    agentProviderModelPlaceholder: '输入模型名，或先点击加载模型',
    agentProviderLoadModels: '加载模型',
    agentProviderModelsHint:
      '会直接请求当前厂商的模型列表接口；如果兼容服务没实现，也可以手动填写模型名。',
    agentProviderUrlPlaceholder: '\u8f93\u5165\u5382\u5546 API \u5730\u5740',
    agentProviderKeyPlaceholder: '\u8f93\u5165 API Key \u6216 Token',
    agentProviderHint:
      '\u5df2\u9884\u7f6e\u5e38\u89c1\u5382\u5546\u7684\u9ed8\u8ba4\u5730\u5740\uff0c\u5207\u6362\u5382\u5546\u540e\u53ef\u518d\u624b\u52a8\u4fee\u6539\u3002',
    agentCodexHint:
      'Codex \u8ba2\u9605\u5171\u4eab Token \u76ee\u524d\u4e0d\u4f1a\u81ea\u52a8\u8bfb\u53d6\uff1b\u5982\u679c\u4f60\u624b\u4e0a\u6709\u53ef\u590d\u7528\u7684 URL \u548c Key\uff0c\u53ef\u4ee5\u76f4\u63a5\u586b\u5728\u8fd9\u91cc\u3002',
    agentSettingsSave: '\u4fdd\u5b58\u914d\u7f6e',
    agentSettingsSavedAt: '\u4e0a\u6b21\u66f4\u65b0',
    agentEmptyTitle: '\u8fd8\u6ca1\u6709\u914d\u7f6e AI \u6a21\u578b',
    agentEmptyDescription:
      '\u5148\u5728\u7ec8\u7aef\u8bbe\u7f6e\u91cc\u914d\u597d\u5927\u6a21\u578b\u5382\u5546\u3001Base URL \u548c API Key\uff0c\u8fd9\u91cc\u624d\u4f1a\u663e\u793a Agent \u9762\u677f\u548c\u5feb\u6377\u64cd\u4f5c\u3002',
    agentDisconnectedTitle: '\u672a\u8fde\u63a5\u8fdc\u7a0b\u4f1a\u8bdd',
    agentDisconnectedDescription:
      '\u5148\u8fde\u63a5\u5f53\u524d\u4f1a\u8bdd\uff0c\u8fde\u63a5\u6210\u529f\u540e\uff0c\u8fd9\u91cc\u624d\u4f1a\u663e\u793a AI Agent \u9762\u677f\u548c\u5feb\u6377\u64cd\u4f5c\u3002',
    openTerminalSettings: '\u6253\u5f00\u7ec8\u7aef\u8bbe\u7f6e',
    connected: '\u5df2\u8fde\u63a5',
    latency: '\u5ef6\u8fdf',
    ready: '\u51c6\u5907\u8fde\u63a5\u3002',
    readyBanner: 'cool-buddy SSH \u63a7\u5236\u53f0\u5df2\u5c31\u7eea',
    terminalIdle:
      '\u8fde\u63a5\u6210\u529f\u540e\uff0c\u7ec8\u7aef\u4f1a\u5728\u8fd9\u91cc\u63a5\u7ba1\u5f53\u524d\u4f1a\u8bdd\u3002',
    waitingEvents: '\u7b49\u5f85\u65b0\u4e8b\u4ef6...',
    aiTaskTitle: '\u4efb\u52a1\uff1a\u4fee\u590d nginx 502 \u9519\u8bef',
    aiTaskBody:
      '\u4e0a\u6e38\u8fde\u63a5\u88ab 8080 \u7aef\u53e3\u62d2\u7edd\uff0c\u6b63\u5728\u5206\u6790\u670d\u52a1\u72b6\u6001...',
    aiResult: "\u7ed3\u679c\uff1a\u670d\u52a1 'node-api' \u5f53\u524d\u672a\u8fd0\u884c\u3002",
    aiRecommendation:
      '\u662f\u5426\u5c1d\u8bd5\u91cd\u542f node \u670d\u52a1\uff0c\u5e76\u987a\u624b\u68c0\u67e5\u7aef\u53e3\u5360\u7528\u4e0e\u8fdb\u7a0b\u51b2\u7a81\uff1f',
    footerConnection: '\u8fde\u63a5\u5230 prod-us-east-1.aws',
    sessionConnected: '\u5df2\u8fde\u63a5',
    sessionDisconnected: '\u672a\u8fde\u63a5',
    sessionConnecting: '\u8fde\u63a5\u4e2d',
    sessionError: '\u8fde\u63a5\u5931\u8d25',
    removeTab: '\u5220\u9664\u6807\u7b7e',
    removeOtherTabs: '\u5173\u95ed\u5176\u4ed6\u6807\u7b7e',
    removeAllTabs: '\u5173\u95ed\u5168\u90e8\u6807\u7b7e',
    deleteSessionTitle: '\u5220\u9664\u4f1a\u8bdd',
    deleteSessionAction: '\u5220\u9664\u4f1a\u8bdd',
    deleteSessionMenu: '\u5220\u9664\u4f1a\u8bdd',
    explorerDisconnectedTitle: '\u672a\u8fde\u63a5\u8fdc\u7a0b\u4f1a\u8bdd',
    explorerDisconnectedHint:
      '\u5148\u8fde\u63a5\u5f53\u524d\u4f1a\u8bdd\uff0c\u8fd9\u91cc\u624d\u4f1a\u663e\u793a\u8fdc\u7a0b\u6587\u4ef6\u4e0e\u6587\u4ef6\u5939\u3002',
    loadingRemoteFiles: '\u6b63\u5728\u52a0\u8f7d\u8fdc\u7a0b\u6587\u4ef6...',
    remotePathPlaceholder: '\u8f93\u5165\u8fdc\u7a0b\u8def\u5f84\u540e\u56de\u8f66',
    showHiddenFiles: '\u663e\u793a\u9690\u85cf\u6587\u4ef6',
    hideHiddenFiles: '\u9690\u85cf\u9690\u85cf\u6587\u4ef6',
    emptyRemoteFolder: '\u5f53\u524d\u76ee\u5f55\u662f\u7a7a\u7684',
    emptyRemoteFolderHint:
      '\u53ef\u4ee5\u62d6\u5165\u6587\u4ef6\u4e0a\u4f20\uff0c\u6216\u8005\u65b0\u5efa\u6587\u4ef6\u5939\u3002',
    newFolderPrompt: '\u8f93\u5165\u65b0\u6587\u4ef6\u5939\u540d\u79f0',
    renamePrompt: '\u8f93\u5165\u65b0\u540d\u79f0',
    deleteConfirm: '\u786e\u8ba4\u5220\u9664',
    terminalTitle: '\u7ec8\u7aef',
    logTitle: '\u5b9e\u65f6\u65e5\u5fd7',
    logPathPlaceholder: '\u8f93\u5165\u8981 tail -f \u7684\u65e5\u5fd7\u6587\u4ef6\u8def\u5f84',
    logSettings: '\u65e5\u5fd7\u8bbe\u7f6e',
    logLineCount: '\u521d\u59cb/\u6eda\u52a8\u6761\u6570',
    logLineCountHint:
      '\u542f\u52a8\u65f6\u9ed8\u8ba4\u62c9\u53d6\u6700\u65b0 N \u6761\uff0c\u8fd0\u884c\u4e2d\u4ec5\u4fdd\u7559\u6700\u65b0 N \u6761\u3002',
    logSaveSettings: '\u4fdd\u5b58\u8bbe\u7f6e',
    logStart: '\u542f\u52a8',
    logStop: '\u5173\u95ed',
    logRunning: '\u8fd0\u884c\u4e2d',
    logStopped: '\u672a\u542f\u52a8',
    logEmptyTitle: '\u8fd8\u6ca1\u6709\u542f\u52a8\u65e5\u5fd7\u6d41',
    logEmptyHint:
      '\u5148\u8bbe\u7f6e\u65e5\u5fd7\u6587\u4ef6\u8def\u5f84\uff0c\u7136\u540e\u70b9\u51fb\u542f\u52a8\u5f00\u59cb tail -f\u3002',
    logDisconnectedTitle: '\u65e5\u5fd7\u9762\u677f\u672a\u8fde\u63a5',
    logDisconnectedHint:
      '\u5148\u8fde\u63a5\u5230\u8fdc\u7a0b\u4f1a\u8bdd\uff0c\u7136\u540e\u518d\u542f\u52a8\u5b9e\u65f6\u65e5\u5fd7\u3002',
    logInvalidFileTitle: '\u65e5\u5fd7\u8def\u5f84\u65e0\u6548',
    logInvalidFileMessage:
      '\u8bf7\u8f93\u5165\u4e00\u4e2a\u771f\u5b9e\u5b58\u5728\u7684\u65e5\u5fd7\u6587\u4ef6\u8def\u5f84\uff0c\u4e0d\u80fd\u662f\u76ee\u5f55\u6216\u5176\u4ed6\u7c7b\u578b\u3002',
    logAddStream: '\u65b0\u589e\u65e5\u5fd7\u7a97\u683c',
    logCloseStream: '\u5173\u95ed\u65e5\u5fd7\u7a97\u683c',
    logPopout: '\u5f39\u51fa\u4e3a\u72ec\u7acb\u7a97\u53e3',
    logStreamLabel: '\u65e5\u5fd7\u6d41'
  },
  'en-US': {
    pasteConfirmTitle: 'Detected multi-line paste',
    pasteExecuteAll: 'Run all',
    pasteExecuteLineByLine: 'Run line by line',
    appName: 'SSH-PRO',
    version: 'v2.4.0-stable',
    searchSessions: 'Search sessions...',
    production: 'Production',
    staging: 'Staging',
    local: 'Local',
    fileExplorer: 'File Explorer',
    newSession: 'New Session',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    password: 'Password',
    connect: 'Connect',
    disconnect: 'Disconnect',
    splitPane: 'Split Pane',
    sessionDetails: 'Session Details',
    noSessions: 'No sessions yet',
    noSessionsHint: 'Create your first SSH session to bring this workspace to life.',
    createSession: 'New Session',
    sessionAuthDescription:
      'Save how this host should authenticate so future connections can start without extra setup.',
    sessionAuthTitle: 'Authentication',
    sessionAuthHint:
      'Use a password when the server expects one, or reuse your local SSH keys when the server already trusts your public key.',
    sessionAuthPassword: 'Password',
    sessionAuthPasswordHint: 'Store a password for hosts that still use password login.',
    sessionAuthSystemKey: 'System SSH Key',
    sessionAuthSystemKeyHint:
      'Prefer your local ssh-agent and default ~/.ssh keys before asking for a manual private key file.',
    sessionAgentAvailable: 'Agent Ready',
    sessionAgentUnavailable: 'No Agent',
    sessionDefaultKeyFound: 'Default Key Found',
    sessionDefaultKeyMissing: 'No Default Key',
    sessionKeySourceDefault: 'Default Locations',
    sessionKeySourceCustom: 'Custom Private Key',
    sessionKeySourceDefaultHint:
      'cool-buddy will try your system SSH agent first, then the common private key files under ~/.ssh.',
    sessionKeySourceCustomHint:
      'Choose a specific private key when this host uses a non-default key or a separate deployment identity.',
    sessionDefaultKeySummary:
      'No readable default private key was detected yet. You can still use ssh-agent or switch to a custom private key file.',
    sessionPrivateKeyPath: 'Private Key Path',
    sessionPrivateKeyPassphrase: 'Key Passphrase',
    browsePrivateKey: 'Choose Key',
    createFirstSession: 'Create First Session',
    saveSession: 'Save Session',
    sessionName: 'Session Name',
    sessionGroup: 'Group',
    cancel: 'Cancel',
    loadingSessions: 'Loading sessions...',
    resourceVitals: 'Resource Vitals',
    cpuUsage: 'CPU Usage',
    memory: 'Memory',
    dockerInstances: 'Docker Instances',
    deviceInfo: 'Device Info',
    metricsDetails: 'Device Details',
    viewDetails: 'View Details',
    deviceSummaryFallback: 'Remote Device',
    hostname: 'Hostname',
    operatingSystem: 'Operating System',
    kernelVersion: 'Kernel',
    architecture: 'Architecture',
    uptime: 'Uptime',
    running: 'Running',
    unavailable: 'Unavailable',
    emptyMetricsTitle: 'No remote metrics yet',
    emptyMetricsHint:
      'Connect to a Linux host that supports command collection to show CPU, memory, and Docker status here.',
    aiAgent: 'AI Agent',
    task: 'Task',
    executedAt: 'Executed at',
    nextRecommendation: 'Next Recommendation',
    askAi: 'Ask AI to perform a task...',
    restartService: 'Restart Service',
    checkLogs: 'Check Logs',
    auditPermissions: 'Audit Permissions',
    agentQuickHostHealth: 'Host Health',
    agentQuickRunningApps: 'Running Apps',
    agentQuickCheckLogs: 'Check Logs',
    agentQuickHostHealthPrompt: 'Check current system metrics and summarize the host health.',
    agentQuickRunningAppsPrompt:
      'Inspect running services and containers, then summarize any obvious concerns.',
    agentQuickCheckLogsPrompt:
      'Read the latest 80 lines from a useful application log and summarize anomalies.',
    keyBindings: 'Key Bindings',
    keyBindingsHint:
      'Examples of the keyboard shortcuts currently supported in this terminal workspace.',
    quickActions: 'Quick Actions',
    terminalSettings: 'Terminal Settings',
    agentSettingsTitle: 'Agent Settings',
    agentSettingsHint:
      'Configure the model provider, URL, and key first, then wire the AI agent to it next.',
    agentSettingsCategoryProvider: 'Model Provider',
    agentProviderLabel: 'Provider',
    agentProviderUrlLabel: 'Base URL',
    agentProviderKeyLabel: 'API Key',
    agentProviderModelLabel: 'Model',
    agentProviderModelPlaceholder: 'Enter a model name, or load the provider list first',
    agentProviderLoadModels: 'Load Models',
    agentProviderModelsHint:
      'This calls the provider model-list API directly. If a compatible service does not implement it, you can still enter a model manually.',
    agentProviderUrlPlaceholder: 'Enter the provider API URL',
    agentProviderKeyPlaceholder: 'Enter the API key or token',
    agentProviderHint:
      'Common provider endpoints are prefilled. You can still edit the URL after switching.',
    agentCodexHint:
      'Codex subscription tokens are not auto-read here right now. If you have a reusable URL and key, enter them manually.',
    agentSettingsSave: 'Save Settings',
    agentSettingsSavedAt: 'Last updated',
    agentEmptyTitle: 'No AI model configured yet',
    agentEmptyDescription:
      'Set the provider, base URL, and API key in Terminal Settings first. The agent panel and quick actions will appear here after that.',
    agentDisconnectedTitle: 'No remote session connected',
    agentDisconnectedDescription:
      'Connect the current session first. The AI agent panel and quick actions become available after the terminal is connected.',
    openTerminalSettings: 'Open Terminal Settings',
    connected: 'Connected',
    latency: 'Latency',
    ready: 'Ready to connect.',
    readyBanner: 'cool-buddy SSH console is ready',
    terminalIdle: 'Once connected, the terminal will take over this session.',
    waitingEvents: 'Waiting for new events...',
    aiTaskTitle: 'Task: Fix nginx 502 error',
    aiTaskBody: 'Upstream connection refused on port 8080. Analyzing service status...',
    aiResult: "Result: Service 'node-api' is inactive.",
    aiRecommendation:
      'Should I restart the node service and check for port conflicts at the same time?',
    footerConnection: 'Connected to prod-us-east-1.aws',
    sessionConnected: 'Connected',
    sessionDisconnected: 'Disconnected',
    sessionConnecting: 'Connecting',
    sessionError: 'Connection Error',
    removeTab: 'Remove Tab',
    removeOtherTabs: 'Close Other Tabs',
    removeAllTabs: 'Close All Tabs',
    deleteSessionTitle: 'Delete Session',
    deleteSessionAction: 'Delete Session',
    deleteSessionMenu: 'Delete Session',
    explorerDisconnectedTitle: 'Remote session is not connected',
    explorerDisconnectedHint:
      'Connect the current session first to browse real remote files and folders here.',
    loadingRemoteFiles: 'Loading remote files...',
    remotePathPlaceholder: 'Enter a remote path and press Enter',
    showHiddenFiles: 'Show hidden files',
    hideHiddenFiles: 'Hide hidden files',
    emptyRemoteFolder: 'This directory is empty',
    emptyRemoteFolderHint: 'Drop files here to upload, or create a new folder.',
    newFolderPrompt: 'Enter a new folder name',
    renamePrompt: 'Enter a new name',
    deleteConfirm: 'Delete',
    terminalTitle: 'Terminal',
    logTitle: 'Live Logs',
    logPathPlaceholder: 'Enter the log file path to stream with tail -f',
    logSettings: 'Log Settings',
    logLineCount: 'Initial and rolling lines',
    logLineCountHint:
      'When streaming starts, the newest N lines are loaded first, and only the newest N lines are kept while following the file.',
    logSaveSettings: 'Save Settings',
    logStart: 'Start',
    logStop: 'Stop',
    logRunning: 'Running',
    logStopped: 'Stopped',
    logEmptyTitle: 'Log streaming is currently off',
    logEmptyHint: 'Set a log file path, then click Start to begin tailing this file.',
    logDisconnectedTitle: 'Log streaming is unavailable',
    logDisconnectedHint: 'Connect to a remote session first, then start the live log stream.',
    logInvalidFileTitle: 'Invalid log path',
    logInvalidFileMessage:
      'Please enter a real log file path. Directories and non-file targets cannot be streamed.',
    logAddStream: 'Add Log Pane',
    logCloseStream: 'Close Log Pane',
    logPopout: 'Open In Window',
    logStreamLabel: 'Log Stream'
  }
} as const;

const enUSMessages = {
  ...baseMessages['en-US'],
  ...localizedMessageOverrides['en-US'],
  agentName: 'Buddy',
  agentRoleUser: 'user',
  agentRoleAssistant: 'assistant',
  agentRoleSystem: 'system',
  agentStatusRunning: 'Running',
  agentStatusReady: 'Ready',
  agentThinkingNow: 'now',
  agentThinkingAria: 'Agent is thinking',
  agentThinkingLabel: 'Think',
  agentReadyTitle: 'Agent is ready',
  agentPreparingDescription: 'Agent is preparing the first tool pass.',
  agentReadyDescription:
    'Ask for a diagnosis, metrics summary, service check, log read, or remote file operation.',
  approvalConfirmation: 'Confirmation',
  approvalP0ArmingNote:
    'This is a P0 action. The first click arms execution, and the second click sends it.',
  approvalP0FinalNote:
    'Final confirmation. This action will run immediately after you confirm again.',
  approvalReject: 'Reject',
  approvalArmExecution: 'Arm Execution',
  approvalConfirmExecution: 'Confirm Execution'
} as const;

type MessageCatalog = Record<keyof typeof enUSMessages, string>;

const zhCNMessages: MessageCatalog = {
  ...baseMessages['zh-CN'],
  ...localizedMessageOverrides['zh-CN'],
  agentName: '小酷',
  agentRoleUser: '用户',
  agentRoleAssistant: '助手',
  agentRoleSystem: '系统',
  agentStatusRunning: '运行中',
  agentStatusReady: '就绪',
  agentThinkingNow: '刚刚',
  agentThinkingAria: 'Agent 正在思考',
  agentThinkingLabel: '思考',
  agentReadyTitle: 'Agent 已就绪',
  agentPreparingDescription: 'Agent 正在准备第一轮工具调用。',
  agentReadyDescription: '可以让它做诊断、指标总结、服务检查、日志读取或远程文件操作。',
  approvalConfirmation: '确认',
  approvalP0ArmingNote: '这是一个 P0 操作。第一次点击会进入待执行状态，第二次点击才会真正发送。',
  approvalP0FinalNote: '最终确认。再次点击后，该操作会立即执行。',
  approvalReject: '拒绝',
  approvalArmExecution: '进入执行确认',
  approvalConfirmExecution: '确认执行'
};

const zhTWMessages: MessageCatalog = {
  ...enUSMessages,
  ...localizedMessageOverrides['zh-TW'],
  agentQuickHostHealth: '主機健康',
  agentQuickRunningApps: '執行中的應用',
  agentQuickCheckLogs: '檢查日誌',
  agentQuickHostHealthPrompt: '檢查目前系統指標，並總結這台主機的健康狀況。',
  agentQuickRunningAppsPrompt: '檢查正在執行的服務與容器，並總結是否存在明顯問題。',
  agentQuickCheckLogsPrompt: '讀取一個有價值的應用日誌最新 80 行，並總結異常點。'
};

const jaJPMessages: MessageCatalog = {
  ...enUSMessages,
  ...localizedMessageOverrides['ja-JP'],
  agentQuickHostHealth: 'ホストの健全性',
  agentQuickRunningApps: '実行中のアプリ',
  agentQuickCheckLogs: 'ログを確認',
  agentQuickHostHealthPrompt:
    '現在のシステムメトリクスを確認し、このホストの健全性を要約してください。',
  agentQuickRunningAppsPrompt:
    '実行中のサービスとコンテナを確認し、明らかな問題があるか要約してください。',
  agentQuickCheckLogsPrompt:
    '価値のあるアプリケーションログの最新 80 行を読み取り、異常点を要約してください。'
};

const koKRMessages: MessageCatalog = {
  ...enUSMessages,
  ...localizedMessageOverrides['ko-KR'],
  agentQuickHostHealth: '호스트 상태',
  agentQuickRunningApps: '실행 중인 앱',
  agentQuickCheckLogs: '로그 확인',
  agentQuickHostHealthPrompt: '현재 시스템 지표를 확인하고 이 호스트의 상태를 요약하세요.',
  agentQuickRunningAppsPrompt:
    '실행 중인 서비스와 컨테이너를 점검하고, 눈에 띄는 문제가 있는지 요약하세요.',
  agentQuickCheckLogsPrompt: '의미 있는 애플리케이션 로그 최신 80줄을 읽고, 이상 징후를 요약하세요.'
};

const deDEMessages: MessageCatalog = {
  ...enUSMessages,
  ...localizedMessageOverrides['de-DE'],
  agentQuickHostHealth: 'Host-Zustand',
  agentQuickRunningApps: 'Laufende Apps',
  agentQuickCheckLogs: 'Logs prüfen',
  agentQuickHostHealthPrompt:
    'Prüfen Sie die aktuellen Systemmetriken und fassen Sie den Zustand dieses Hosts zusammen.',
  agentQuickRunningAppsPrompt:
    'Untersuchen Sie laufende Dienste und Container und fassen Sie auffällige Probleme zusammen.',
  agentQuickCheckLogsPrompt:
    'Lesen Sie die letzten 80 Zeilen eines aussagekräftigen Anwendungslogs und fassen Sie Auffälligkeiten zusammen.'
};

const ruRUMessages: MessageCatalog = {
  ...enUSMessages,
  ...localizedMessageOverrides['ru-RU'],
  agentQuickHostHealth: 'Состояние хоста',
  agentQuickRunningApps: 'Запущенные приложения',
  agentQuickCheckLogs: 'Проверить логи',
  agentQuickHostHealthPrompt:
    'Проверьте текущие системные метрики и кратко опишите состояние этого хоста.',
  agentQuickRunningAppsPrompt:
    'Проверьте запущенные сервисы и контейнеры и кратко опишите заметные проблемы.',
  agentQuickCheckLogsPrompt:
    'Прочитайте последние 80 строк полезного лога приложения и кратко опишите аномалии.'
};

const arSAMessages: MessageCatalog = {
  ...enUSMessages,
  ...localizedMessageOverrides['ar-SA'],
  agentQuickHostHealth: 'صحة المضيف',
  agentQuickRunningApps: 'التطبيقات قيد التشغيل',
  agentQuickCheckLogs: 'فحص السجلات',
  agentQuickHostHealthPrompt: 'تحقق من مؤشرات النظام الحالية ثم لخّص حالة هذا المضيف.',
  agentQuickRunningAppsPrompt:
    'افحص الخدمات والحاويات العاملة ثم لخّص ما إذا كانت هناك مشكلات واضحة.',
  agentQuickCheckLogsPrompt: 'اقرأ آخر 80 سطرًا من سجل تطبيق مفيد ثم لخّص النقاط غير الطبيعية.'
};

export const messages: Record<Locale, MessageCatalog> = {
  'zh-CN': zhCNMessages,
  'en-US': enUSMessages,
  'zh-TW': zhTWMessages,
  'ja-JP': jaJPMessages,
  'ko-KR': koKRMessages,
  'de-DE': deDEMessages,
  'ru-RU': ruRUMessages,
  'ar-SA': arSAMessages
};

export type MessageKey = keyof typeof enUSMessages;
