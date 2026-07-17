# Research OpenLLMetry/Traceloop

# OpenLLMetry / Traceloop — Build vs. Buy Research Findings

## 1. What OpenLLMetry Is
- Confirmed: "open-source observability for your GenAI or LLM application, based on OpenTelemetry" — non-intrusive instrumentation built on top of OTel.
  Source: https://github.com/traceloop/openllmetry
- README states: "Our semantic conventions are now part of OpenTelemetry!" — i.e., OpenLLMetry's GenAI span conventions were contributed to the official OTel semantic-conventions spec.
  Source: https://github.com/traceloop/openllmetry
- **Instruments 16 LLM providers**: Aleph Alpha, Anthropic, AWS Bedrock, Cohere, Google Gemini, Groq, HuggingFace, IBM Watsonx, Mistral AI, Ollama, OpenAI/Azure OpenAI, Replicate, AWS SageMaker, Together AI, Google Vertex AI, WRITER.
- **9 frameworks**: LangChain, LlamaIndex, LangGraph, LangFlow, CrewAI, Haystack, LiteLLM, Agno, AWS Strands, OpenAI Agents SDK.
- **7 vector DBs**: Chroma, LanceDB, Marqo, Milvus, Pinecone, Qdrant, Weaviate. Also supports MCP (Model Context Protocol).
  Source: https://github.com/traceloop/openllmetry

## 2. Exact License
- **Apache License, Version 2.0** (confirmed from raw LICENSE file text: "Apache License / Version 2.0, January 2004").
  Source: https://raw.githubusercontent.com/traceloop/openllmetry/main/LICENSE
- Also confirmed via GitHub API metadata (`license: Apache License 2.0`).
  Source: https://api.github.com/repos/traceloop/openllmetry

## 3. Instrumentation-only vs. bundled storage — THE CRUX
- **OpenLLMetry ships NO storage/UI of its own.** It is purely an SDK/instrumentation layer that emits OTel spans; you configure an exporter.
- Docs confirm quickstarts (Python/JS-TS/Next.js/Go/Ruby) that call `Traceloop.init(app_name=...)` and route spans via OTel to a destination of choice: **the Traceloop hosted platform (native), an OTel Collector to self-host (Jaeger/Tempo/etc.), or 25+ third-party backends** (Datadog, Honeycomb, Grafana, New Relic, Splunk, SigNoz, Dynatrace, Google Cloud, Azure App Insights, Sentry, etc.).
  Source: https://www.traceloop.com/docs/openllmetry/introduction
- **Conclusion: you must bring your own backend** (self-built Postgres store, Jaeger, Tempo, Honeycomb, etc.) or pay for Traceloop's hosted product — OpenLLMetry the library does not store or visualize anything itself.

## 4. Traceloop's separate commercial SaaS product
- Confirmed: Traceloop the company sells a hosted platform (dashboard at app.traceloop.com), distinct from the open-source OpenLLMetry SDK. Capabilities: prompt/response/latency monitoring, built-in eval metrics (faithfulness, relevance, safety), custom evaluator training, CI/CD quality gates.
  Source: https://www.traceloop.com
- **This hosted platform is proprietary/closed-source.** The `traceloop` GitHub org contains only SDK/instrumentation repos (openllmetry, openllmetry-js, go/ruby SDKs, `hub` LLM gateway, MCP server) — no repo for the dashboard/backend itself.
  Source: https://github.com/traceloop
- Pricing page confirms a Free tier (50K spans/mo, 5 seats, 24h retention, monitoring + eval dashboards, CI/CD, prompt management) and an Enterprise tier (custom pricing, SOC 2, on-prem deployment, unlimited seats, dedicated Slack support).
  Source: https://www.traceloop.com/pricing

## 5. Multi-tenant support
- **Neither the marketing site nor the pricing page mentions multi-tenant orgs/projects or per-tenant cost tracking.** Pricing only differentiates by seat count (5 vs. unlimited) and data retention — no mention of tenant-level segregation or cost allocation.
  Sources: https://www.traceloop.com , https://www.traceloop.com/pricing
- **Implication for AdWasta's non-negotiable "every table/query scoped by tenant_id":** multi-tenancy is NOT a built-in feature of either OpenLLMetry or the Traceloop SaaS. You would need to build it yourself — e.g., stamping a `tenant_id` resource/span attribute via OTel and filtering/aggregating on it in whatever backend you choose (self-hosted or Traceloop's).

## 6. GitHub stats
- **Stars: ~7,308** (openllmetry-js sibling repo separately has ~406).
- **Created:** Sept 2, 2023. **Last pushed:** July 13, 2026. **Last updated (API timestamp):** July 17, 2026 — actively maintained.
  Source: https://api.github.com/repos/traceloop/openllmetry
