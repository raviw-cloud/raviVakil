import { createApp } from './app';
import { config } from './config';
import { logger } from './infrastructure/logger';

const app = createApp();

app.listen(config.PORT, () => {
  logger.info(`Legal Document Analyzer running on http://localhost:${config.PORT}`);
});
