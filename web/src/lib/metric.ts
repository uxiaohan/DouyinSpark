interface MetricValue {
  prefix: string
  value: number
  decimals: number
  suffix: string
  grouped: boolean
}

export function parseMetric(input: string): MetricValue {
  const match = input.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/)
  if (!match) return { prefix: '', value: 0, decimals: 0, suffix: input, grouped: false }

  const [, prefix, rawValue, suffix] = match
  return {
    prefix,
    value: Number(rawValue.replaceAll(',', '')),
    decimals: rawValue.split('.')[1]?.length ?? 0,
    suffix,
    grouped: rawValue.includes(','),
  }
}

export function formatMetricValue(metric: MetricValue, value: number): string {
  const number = value.toLocaleString('en-US', {
    minimumFractionDigits: metric.decimals,
    maximumFractionDigits: metric.decimals,
    useGrouping: metric.grouped,
  })
  return `${metric.prefix}${number}${metric.suffix}`
}
