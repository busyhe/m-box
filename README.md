# TanStack Starter

一个基于 [TanStack Start](https://tanstack.com/start) 的现代化全栈应用模板，使用 pnpm + Turborepo 组织的 Monorepo 架构。

## 技术栈

- **框架**: [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router)
- **构建工具**: [Vite 8](https://vite.dev)
- **UI**: React 19 + [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- **语言**: TypeScript 5.9
- **包管理**: pnpm 10 (workspace + catalog)
- **任务编排**: [Turborepo](https://turbo.build)
- **测试**: Vitest + Testing Library
- **代码规范**: ESLint 9 + Prettier + Lefthook + Commitizen

## 项目结构

```
tanstack-starter/
├── apps/
│   └── www/                    # TanStack Start 应用
├── packages/
│   ├── ui/                     # 共享 UI 组件库 (shadcn/ui)
│   ├── eslint-config/          # 共享 ESLint 配置
│   └── typescript-config/      # 共享 TypeScript 配置
├── scripts/                    # 工程脚本
├── turbo.json                  # Turborepo 配置
├── pnpm-workspace.yaml         # pnpm workspace + catalog
└── lefthook.yml                # Git hooks
```

## 环境要求

- Node.js `>= 20`
- pnpm `10.27.0`

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器 (默认 http://localhost:3000)
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm check-types

# Lint
pnpm lint

# 格式化
pnpm format
```

## 常用脚本

| 命令               | 说明                          |
| ------------------ | ----------------------------- |
| `pnpm dev`         | 启动所有应用的开发模式        |
| `pnpm build`       | 构建所有应用与包              |
| `pnpm lint`        | 运行 ESLint                   |
| `pnpm check-types` | TypeScript 类型检查           |
| `pnpm format`      | Prettier 格式化               |
| `pnpm clean`       | 清理构建产物与 `node_modules` |
| `pnpm commit`      | 使用 czg 创建规范化提交       |
| `pnpm release`     | 使用 bumpp 统一更新版本号     |

## 依赖管理

本项目使用 pnpm **catalog** 统一管理依赖版本。新增公共依赖时，请先在 [pnpm-workspace.yaml](pnpm-workspace.yaml) 的 `catalog` 中声明版本，再在对应 package 中以 `"catalog:"` 引用。

## Git 工作流

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，推荐使用 `pnpm commit`
- [Lefthook](lefthook.yml) 在提交前自动执行 lint / 类型检查
- 版本发布使用 [bumpp](https://github.com/antfu-collective/bumpp)

## License

MIT
