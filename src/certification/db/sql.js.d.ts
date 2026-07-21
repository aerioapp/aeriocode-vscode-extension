declare module "sql.js" {
	interface SqlJsStatic {
		Database: new (data?: ArrayLike<number> | Buffer | null) => SqlJsDatabase
	}

	interface SqlJsDatabase {
		run(sql: string, params?: unknown[]): void
		exec(sql: string, params?: unknown[]): QueryExecResult[]
		export(): Uint8Array
		close(): void
		getRowsModified(): number
	}

	interface QueryExecResult {
		columns: string[]
		values: unknown[][]
	}

	interface InitOptions {
		locateFile?: (file: string) => string
	}

	export default function initSqlJs(options?: InitOptions): Promise<SqlJsStatic>
	export type { SqlJsStatic, SqlJsDatabase, QueryExecResult, InitOptions }
}
