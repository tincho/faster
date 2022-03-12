/*
Created by: Henrique Emanoel Viana
Githu: https://github.com/hviana
Page: https://sites.google.com/site/henriqueemanoelviana
cel: +55 (41) 99999-4664
*/

import { Context, NextFunc, Params, ProcessorFunc } from "../server.ts";
import {
  crypto,
  deleteCookie,
  getCookies,
  setCookie,
  storage,
} from "../deps.ts";

export type Session = {
  key: string;
  value: Params;
  lastAccessTime: number;
};

export class SessionStorageEngine {
  expiresInMinutes: number;
  checkInterval: number = 0; //checkInterval may not be necessary depending on the engine
  constructor(expiresInMinutes: number) {
    this.expiresInMinutes = expiresInMinutes;
  }
  async init(): Promise<void> {
    throw new Error(`"init" not implemented in: ${this.constructor.name}`);
  }
  async delete(key: string): Promise<void> {
    throw new Error(`"delete" not implemented in: ${this.constructor.name}`);
  }
  async set(session: Session): Promise<void> {
    throw new Error(`"set" not implemented in: ${this.constructor.name}`);
  }
  async get(key: string): Promise<Session> {
    throw new Error(`"get" not implemented in: ${this.constructor.name}`);
  }
  async getAll(): Promise<Session[]> {
    throw new Error(`"getAll" not implemented in: ${this.constructor.name}`);
  }
}

export class SQLiteStorageEngine extends SessionStorageEngine {
  constructor(expiresInMinutes: number) {
    super(expiresInMinutes);
  }
  async init(): Promise<void> {
    const expiresInMS = this.expiresInMinutes * 60 * 1000;
    clearInterval(this.checkInterval);
    this.checkInterval = setInterval(async () => {
      const sessions = await this.getAll();
      const currentTime = Date.now();
      for (const s of sessions) {
        if ((currentTime - s.lastAccessTime) > expiresInMS) {
          await this.delete(s.key);
        }
      }
    }, expiresInMS);
  }
  async delete(key: string): Promise<void> {
    await storage.delete(`faster_sessions.${key}`);
  }
  async set(session: Session): Promise<void> {
    return await storage.set(`faster_sessions.${session.key}`, session);
  }
  async get(key: string): Promise<Session> {
    return await storage.get(`faster_sessions.${key}`);
  }
  async getAll(): Promise<Session[]> {
    return await storage.getList("faster_sessions.");
  }
}

export function session(
  engine: SessionStorageEngine = new SQLiteStorageEngine(60),
) {
  engine.init(); //no await, beware
  return async (ctx: Context, next: NextFunc) => {
    var key = getCookies(ctx.req.headers).faster_session_id;
    ctx.extra.session = {};
    var hasSession = false;
    if (key) {
      const session_data = await engine.get(key);
      if (session_data) {
        hasSession = true;
        ctx.extra.session = session_data.value;
      }
    }
    ctx.postProcessors.add(async (ctx: Context) => {
      if ((Object.keys(ctx.extra.session).length > 0) || hasSession) {
        if (!key) {
          key = crypto.randomUUID();
          setCookie(ctx.res.headers, { name: "faster_session_id", value: key });
        }
        await engine.set({
          key: key,
          value: ctx.extra.session,
          lastAccessTime: Date.now(),
        });
      } else {
        if (key) {
          deleteCookie(ctx.res.headers, "faster_session_id");
        }
      }
    });

    await next();
  };
}
