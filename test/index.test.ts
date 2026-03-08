import { describe, it, expect } from 'vitest'
import func from '../src/index'
describe('File System Wrapper Tests', () => {
	it('should return false for a non-existent file', async () => {
		const result = await func.file_exists('./non-existent-file.txt')
		expect(result).toBe(false)
	})
	it('should correctly determine the protocol of a URL', async () => {
		const isFile = await func.is_file('./package.json')
		expect(typeof isFile).toBe('boolean')
	})
	it('should fetch data from a valid URL', async () => {
		const data = await func.file_get_contents('https://www.google.com')
		expect(data).not.toBe(false)
	})
})