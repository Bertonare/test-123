import http from 'http';
import config from '../config';
import { createDummyApp } from '../dummy-app/server';
import { createDashboardApp } from './server';

async function start() {
  if (config.useDummyApp) {
    const dummyPort = config.ports.dummyApp;
    let alreadyRunning = false;
    try {
      const res = await fetch(`http://127.0.0.1:${dummyPort}/api/health`);
      alreadyRunning = res.ok;
    } catch {
      alreadyRunning = false;
    }

    if (!alreadyRunning) {
      const dummyApp = createDummyApp();
      await new Promise<void>((resolve) => {
        http.createServer(dummyApp).listen(dummyPort, () => resolve());
      });
      console.log(`[Dummy Target App] running at http://localhost:${dummyPort}`);
    } else {
      console.log(`[Dummy Target App] already reachable at http://localhost:${dummyPort}`);
    }
  }

  const dashboardApp = createDashboardApp();
  const dashboardPort = config.ports.dashboard;
  dashboardApp.listen(dashboardPort, () => {
    console.log(`[SDET Dashboard]   running at http://localhost:${dashboardPort}`);
  });
}

void start();
