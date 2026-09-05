import { AppController } from './app.controller';

describe('AppController', () => {
  const appController = new AppController();

  it('reports a healthy API without exposing database records', () => {
    const result = appController.health();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeInstanceOf(Date);
  });
});
