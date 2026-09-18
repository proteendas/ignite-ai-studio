# IgniteAI Studio — documentation

Everything needed to run, understand, extend and deploy IgniteAI Studio.

## Start here

| I want to… | Read |
| --- | --- |
| Get it running on my machine | [Getting started](./getting-started.md) |
| Understand every environment variable | [Configuration](./configuration.md) |
| Learn what the product actually does | [Features](./features.md) |
| Understand how it is built | [Architecture](./architecture.md) |
| Call the HTTP API | [API reference](./api-reference.md) |
| Understand the database | [Data model](./data-model.md) |
| Swap or add an AI provider | [Providers](./providers.md) |
| Add an agent tool | [Agent & tools](./agent-tools.md) |
| Build UI that matches | [UI & design system](./ui-design-system.md) |
| Review the security posture | [Security](./security.md) |
| Contribute a change | [Contributing](./contributing.md) |
| Deploy it | [Deployment](./deployment/README.md) |

## Deployment paths

Two supported targets, documented end to end:

- **[Single EC2 instance](./deployment/ec2-docker.md)** — the whole stack on one box with Docker
  Compose and Caddy for TLS. The closest match to how the repo is built, and the recommended
  production path.
- **[Free tier](./deployment/serverless-free-tier.md)** — the best available zero-cost hosting,
  with an honest account of which options work as-is and which need a data-layer change first.

See the [deployment overview](./deployment/README.md) for a side-by-side comparison.

## What this app is

A multi-provider AI content and assistant platform, built around your own documents:

- **Grounded RAG chat** with visible citations and a Grounded / General / Agent mode toggle
- **Agentic tools** with human-in-the-loop approval of every side effect
- **Content generation** from an ingested document, across channels and tones
- **Local-first option** via Ollama, with no API key and no data leaving the machine
- **Provider-agnostic**, with twelve chat providers and per-user encrypted keys

The [`/specs`](../specs) folder holds the original spec-first design documents. This `docs/`
folder describes the system as built.
