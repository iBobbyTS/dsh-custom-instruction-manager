import { rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { build } from 'tsdown'
rmSync('lib', {recursive:true,force:true})
execFileSync('pnpm',['exec','tsc','-p','tsconfig.build.json'],{stdio:'inherit'})
const { default: configs } = await import('../tsdown.config.ts')
for (const config of typeof configs === 'function' ? configs() : configs) await build({...config, config:false})
