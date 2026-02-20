{{/*
Chart name truncated to 63 chars.
*/}}
{{- define "shot.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name.
*/}}
{{- define "shot.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "shot.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.global.imageTag | quote }}
{{- end }}

{{/*
Selector labels for a component.
Usage: {{ include "shot.selectorLabels" (dict "component" "api" "root" .) }}
*/}}
{{- define "shot.selectorLabels" -}}
app.kubernetes.io/name: {{ include "shot.fullname" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Image reference for a service.
Usage: {{ include "shot.image" (dict "svc" .Values.api "root" .) }}
*/}}
{{- define "shot.image" -}}
{{- $tag := .svc.image.tag | default .root.Values.global.imageTag -}}
{{- if not $tag }}{{ fail "Image tag must be set: use --set global.imageTag=<tag>" }}{{ end -}}
{{- printf "%s/%s:%s" .root.Values.global.imageRegistry .svc.image.repository $tag }}
{{- end }}

{{/*
Common envFrom: shared Secret + ConfigMap.
*/}}
{{- define "shot.commonEnvFrom" -}}
- secretRef:
    name: {{ include "shot.fullname" . }}-secret
- configMapRef:
    name: {{ include "shot.fullname" . }}-config
{{- end }}
