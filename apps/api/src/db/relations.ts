import { defineRelations } from 'drizzle-orm';
import * as tables from './schema';

export const schema = defineRelations(tables);
