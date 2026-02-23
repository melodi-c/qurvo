{{/*
Chart name truncated to 63 chars.
*/}}
{{- define "qurvo.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name.
*/}}
{{- define "qurvo.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "qurvo.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.global.imageTag | quote }}
{{- end }}

{{/*
Selector labels for a component.
Usage: {{ include "qurvo.selectorLabels" (dict "component" "api" "root" .) }}
*/}}
{{- define "qurvo.selectorLabels" -}}
app.kubernetes.io/name: {{ include "qurvo.fullname" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Image reference for a service.
Usage: {{ include "qurvo.image" (dict "svc" .Values.api "root" .) }}
*/}}
{{- define "qurvo.image" -}}
{{- $tag := .svc.image.tag | default .root.Values.global.imageTag -}}
{{- if not $tag }}{{ fail "Image tag must be set: use --set global.imageTag=<tag>" }}{{ end -}}
{{- printf "%s/%s:%s" .root.Values.global.imageRegistry .svc.image.repository $tag }}
{{- end }}

{{/*
Datadog unified service tagging labels.
Usage: {{ include "qurvo.datadogLabels" (dict "component" "api" "root" .) }}
*/}}
{{- define "qurvo.datadogLabels" -}}
{{- if .root.Values.datadog.enabled }}
tags.datadoghq.com/service: qurvo-{{ .component }}
tags.datadoghq.com/env: {{ .root.Values.datadog.env }}
tags.datadoghq.com/version: {{ .root.Values.global.imageTag | quote }}
{{- end }}
{{- end }}

{{/*
Datadog log annotations for a container.
Usage: {{ include "qurvo.datadogLogAnnotations" (dict "container" "api" "source" "nodejs" "root" .) }}
*/}}
{{- define "qurvo.datadogLogAnnotations" -}}
{{- if .root.Values.datadog.enabled }}
ad.datadoghq.com/{{ .container }}.logs: '[{"source":"{{ .source }}","service":"qurvo-{{ .container }}"}]'
{{- end }}
{{- end }}

{{/*
Datadog APM env vars for NestJS containers.
Usage: {{ include "qurvo.datadogEnvVars" (dict "component" "api" "root" .) | nindent 12 }}
*/}}
{{- define "qurvo.datadogEnvVars" -}}
{{- if .root.Values.datadog.enabled }}
- name: DD_SERVICE
  value: qurvo-{{ .component }}
- name: DD_ENV
  value: {{ .root.Values.datadog.env }}
- name: DD_VERSION
  value: {{ .root.Values.global.imageTag | quote }}
- name: DD_AGENT_HOST
  valueFrom:
    fieldRef:
      fieldPath: status.hostIP
- name: DD_TRACE_AGENT_PORT
  value: "8126"
- name: DD_RUNTIME_METRICS_ENABLED
  value: "true"
- name: DD_LOGS_INJECTION
  value: "true"
- name: DD_PROFILING_ENABLED
  value: "true"
{{- end }}
{{- end }}

{{/*
Common envFrom: shared Secret + ConfigMap.
*/}}
{{- define "qurvo.commonEnvFrom" -}}
- secretRef:
    name: {{ include "qurvo.fullname" . }}-secret
- configMapRef:
    name: {{ include "qurvo.fullname" . }}-config
{{- end }}
