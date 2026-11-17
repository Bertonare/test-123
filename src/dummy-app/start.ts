import config from '../config';
import { createDummyApp } from './server';

const app = createDummyApp();
const port = config.ports.dummyApp;

app.listen(port, () => {
  console.log(`[Dummy Target App] running at http://localhost:${port}`);
  console.log(`[Dummy Target App] OAuth endpoint: http://localhost:${port}/oauth/token`);
  console.log(`[Dummy Target App] Web Login UI:  http://localhost:${port}/login`);
});
