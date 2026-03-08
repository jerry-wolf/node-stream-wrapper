import { EventEmitter } from 'node:events'
type Abortable = EventEmitter.Abortable
import { Transform } from 'node:stream'
import fs from 'node:fs/promises'
import fetch from 'node-fetch'
import { pipeline } from 'node:stream/promises'
import readline from 'node:readline/promises'
type FileOpenMode = 'r' | 'r+' | 'w' | 'w+' | 'a' | 'a+' | 'x' | 'x+' | 'c' | 'c+' | 'e' | 'n'
const get_protocol = (filename: string): 'file' | 'data' | 'http' => {
	let url
	try {
		url = new URL(filename)
	} catch {
		return 'file'
	}
	if (url.protocol === 'data') return 'data'
	else if (['http:', 'https:'].includes(url.protocol)) return 'http'
	throw new Error(`Unable to find the wrapper "${url.protocol}"`)
}
class ByteCounter extends Transform {
	bytesCount = 0
	_transform(chunk: any, encoding: BufferEncoding, callback: Function) {
		this.bytesCount += chunk.length
		this.push(chunk)
		callback()
	}
}
const func = {
	fopen: async (filename: string, mode: FileOpenMode): Promise<fs.FileHandle | false> => {
		return fs.open(filename, mode)
	},
	fclose: async (stream: fs.FileHandle): Promise<boolean> => {
		return stream.close().then(() => true, () => false)
	},
	fread: async (stream: fs.FileHandle, length: number): Promise<string | false> => {
		try {
			const buffer = Buffer.alloc(length)
			const { bytesRead } = await stream.read(buffer, 0, length)
			return buffer.subarray(0, bytesRead).toString('utf-8')
		} catch {
			return false
		}
	},
	fwrite: async (stream: fs.FileHandle, data: string): Promise<number | false> => {
		try {
			const { bytesWritten } = await stream.write(data)
			return bytesWritten
		} catch {
			return false
		}
	},
	file_get_contents: async (filename: string, options?: Abortable): Promise<string | false> => {
		if (get_protocol(filename) === 'file') {
			return fs.readFile(filename, { encoding: 'utf-8', signal: options?.signal }).catch(() => false)
		}
		else {
			const response = await fetch(filename, { signal: options?.signal })
			if (response.ok) {
				return response.text()
			} else return false
		}
	},
	file_put_contents: async (filename: string, data: string, options?: Abortable): Promise<number | false> => {
		try {
			await fs.writeFile(filename, data, { signal: options?.signal })
			return data.length
		} catch {
			return false
		}
	},
	file: async (filename: string, options?: Abortable): Promise<string[] | false> => {
		let rl
		try {
			if (get_protocol(filename) === 'file') {
				const handle = await fs.open(filename)
				rl = handle.readLines()
			} else {
				const response = await fetch(filename)
				if (!response.ok || !response.body) return false
				rl = readline.createInterface({ input: response.body })
			}
			const arr = []
			for await (const line of rl) {
				options?.signal?.throwIfAborted()
				arr.push(line)
			}
			return arr
		} catch {
			return false
		} finally {
			rl?.close()
		}
	},
	readfile: async (filename: string, options: Abortable): Promise<number | false> => {
		try {
			if (get_protocol(filename) === 'file') {
				const handle = await fs.open(filename)
				const stream = handle.createReadStream()
				await pipeline(stream, process.stdout, { signal: options?.signal })
				return stream.bytesRead
			} else {
				const response = await fetch(filename)
				if (!response.ok || !response.body) return false
				const counter = new ByteCounter
				await pipeline(response.body, counter, process.stdout, { signal: options?.signal })
				return counter.bytesCount
			}
		} catch {
			return false
		}
	},
	file_exists: async (filename: string): Promise<boolean> => {
		try {
			if (get_protocol(filename) === 'file') {
				return await fs.access(filename).then(() => true)
			} else {
				const response = await fetch(filename, { method: 'HEAD' })
				return response.ok
			}
		} catch {
			return false
		}
	},
	filesize: async (filename: string): Promise<number | false> => {
		try {
			if (get_protocol(filename) === 'file') {
				const result = await fs.stat(filename)
				return result.size
			} else {
				const response = await fetch(filename, { method: 'HEAD' })
				const length = response.headers.get('content-length')
				return length ? Number(length) : false
			}
		} catch {
			return false
		}
	},
	is_file: async (filename: string): Promise<boolean> => {
		try {
			const result = await fs.stat(filename)
			return result.isFile()
		} catch {
			return false
		}
	},
	is_dir: async (filename: string): Promise<boolean> => {
		try {
			const result = await fs.stat(filename)
			return result.isDirectory()
		} catch {
			return false
		}
	},
	copy: async (from: string, to: string, options?: Abortable): Promise<boolean> => {
		if (get_protocol(from) === 'file') {
			return fs.copyFile(from, to).then(() => true, () => false)
		} else {
			const response = await fetch(from)
			if (!response.ok) return false
			const handle = await fs.open(to, 'w')
			const stream = handle.createWriteStream()
			if (!response.body) return false
			await pipeline(response.body, stream, { signal: options?.signal })
			return true
		}
	},
	rename: async (from: string, to: string): Promise<boolean> => {
		return fs.rename(from, to).then(() => true, () => false)
	},
	unlink: async (filename: string): Promise<boolean> => {
		return fs.unlink(filename).then(() => true, () => false)
	},
	mkdir: async (directory: string, permissions: number = 0o777, recursive: boolean = false): Promise<boolean> => {
		return fs.mkdir(directory, { mode: permissions, recursive }).then(() => true, () => false)
	},
	rmdir: async (directory: string): Promise<boolean> => {
		return fs.rmdir(directory).then(() => true, () => false)
	},
	filemtime: async (filename: string): Promise<number | false> => {
		try {
			if (get_protocol(filename) === 'file') {
				const stat = await fs.stat(filename)
				return Math.floor(stat.mtime.getTime() / 1000)
			} else {
				const response = await fetch(filename, { method: 'HEAD' })
				if (!response.ok) return false
				const mtime = response.headers.get('last-modified')
				return mtime ? Math.floor(new Date(mtime).getTime() / 1000) : false
			}
		} catch {
			return false
		}
	},
	filectime: async (filename: string): Promise<number | false> => {
		try {
			if (get_protocol(filename) === 'file') {
				const stat = await fs.stat(filename)
				return Math.floor(stat.ctime.getTime() / 1000)
			} else {
				const response = await fetch(filename, { method: 'HEAD' })
				if (!response.ok) return false
				const mtime = response.headers.get('last-modified')
				return mtime ? Math.floor(new Date(mtime).getTime() / 1000) : false
			}
		} catch {
			return false
		}
	},
	chmod: async (filename: string, permissions: number): Promise<boolean> => {
		try {
			await fs.chmod(filename, permissions)
			return true
		} catch {
			return false
		}
	},
	chown: async (filename: string, user: number): Promise<boolean> => {
		try {
			await fs.chown(filename, user, user)
			return true
		} catch {
			return false
		}
	},
	touch: async (filename: string, mtime?: number, atime?: number): Promise<boolean> => {
		try {
			const now = new Date
			try {
				await fs.utimes(filename, mtime ?? now, atime ?? now)
			} catch {
				const handle = await fs.open(filename, 'a')
				await handle.close()
			}
			return true
		} catch {
			return false
		}
	},
	stream_get_contents: async (stream: fs.FileHandle, length?: number, offset: number = -1, options?: Abortable): Promise<string | false> => {
		return stream.readFile({ encoding: 'utf-8', signal: options?.signal }).catch(() => false)
	},
	stream_copy_to_stream: async (from: ReadableStream, to: WritableStream, length?: number, offset: number = 0, options?: Abortable): Promise<number | false> => {
		try {
			const counter = new ByteCounter
			await pipeline(from, counter, to, { signal: options?.signal })
			return counter.bytesCount
		} catch {
			return false
		}
	}
}
export { FileOpenMode }
export default func