import axios from 'axios';

export const httpClient = axios.create({
  timeout: 10000,
  headers: {
    'X-Requested-With': 'cool-buddy-renderer',
    'Accept-Language': 'zh-CN'
  }
});
