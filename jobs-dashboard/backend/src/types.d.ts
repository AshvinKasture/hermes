declare module "passport-google-oauth20" {
  import { Strategy as PassportStrategy } from "passport";

  export interface Profile {
    id: string;
    displayName?: string;
    emails?: { value: string; type?: string }[];
    photos?: { value: string }[];
    [key: string]: unknown;
  }

  export interface AuthenticateOptions {
    scope?: string[];
    failureRedirect?: string;
    [key: string]: unknown;
  }

  export class Strategy extends PassportStrategy {
    constructor(
      options: {
        clientID: string;
        clientSecret: string;
        callbackURL: string;
        userProfileURL?: string;
      },
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (error: unknown, user?: unknown) => void
      ) => void
    );
    authenticate(req: unknown, options?: AuthenticateOptions): void;
  }

  export { Strategy as default };
}

declare module "sql.js" {
  interface SqlJsInit {
    Database: new (buffer: Buffer) => Database;
  }

  interface Database {
    prepare(sql: string): Statement;
    close(): void;
  }

  interface Statement {
    bind(params: unknown[]): void;
    step(): boolean;
    getAsObject<T = Record<string, unknown>>(defaults?: T): T;
    free(): void;
  }

  export default function initSqlJs(config?: unknown): Promise<SqlJsInit>;
}