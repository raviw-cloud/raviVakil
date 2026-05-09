import { Router } from 'express';
import express from 'express';
import { draftController } from '../controllers/draft.controller';

export const draftRouter = Router();
draftRouter.post('/draft', express.json(), draftController);
