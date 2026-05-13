import axios from 'axios';
import { defaultLocale } from '../../../shared/locale';

export const httpClient = axios.create({
  timeout: 10000,
  headers: {
    'X-Requested-With': 'cool-buddy-renderer',
    'Accept-Language': defaultLocale
  }
});
