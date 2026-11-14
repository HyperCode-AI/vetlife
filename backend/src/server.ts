import { app } from './app';
import { env } from './config/env';
import { repositorySingleton } from './infrastructure/repositories/HybridVetLifeRepository';

const port = env.PORT;

app.listen(port, () => {
  console.log(
    `[VetLife API] Server running on http://localhost:${port}/api/v1 (Storage: ${repositorySingleton.getStorageMode()})`
  );
});
