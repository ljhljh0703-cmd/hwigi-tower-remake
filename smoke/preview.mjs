import { access } from 'node:fs/promises'
import { preview } from 'vite'

export default async function startPreview() {
  try {
    await access('dist/index.html')
  } catch (error) {
    throw new Error('화면 검사 전에 npm run build로 배포 파일을 생성하세요.', { cause: error })
  }

  const host = '127.0.0.1'
  const base = '/hwigi-tower-remake/'
  const server = await preview({ base, preview: { host, port: 0 } })
  process.env.HWIGI_SMOKE_URL = `http://${host}:${server.httpServer.address().port}${base}`
  return () => server.close()
}
