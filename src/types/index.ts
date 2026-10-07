import { Request } from 'express';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface SocketUserPayload {
  userId: number;
  email: string;
  name: string;
}
