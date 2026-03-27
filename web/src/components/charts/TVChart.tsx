import { useEffect, useRef } from 'react'
import { createChart, type IChartApi, type DeepPartial, type ChartOptions } from 'lightweight-charts'

interface AreaPoint { time: string; value: number }

interface Props {
  data: AreaPoint[]
  height?: number
  positive?: boolean
}

const BASE_OPTS: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: 'transparent' },
    textColor: '#404060',
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    fontSize: 10,
  },
  grid: {
    vertLines: { color: 'rgba(0,255,65,0.03)' },
    horzLines: { color: 'rgba(0,255,65,0.03)' },
  },
  crosshair: {
    mode: 1,
    vertLine: {
      color: 'rgba(0,255,65,0.35)',
      width: 1,
      style: 3,
      labelBackgroundColor: '#060606',
    },
    horzLine: {
      color: 'rgba(0,255,65,0.35)',
      width: 1,
      style: 3,
      labelBackgroundColor: '#060606',
    },
  },
  rightPriceScale: {
    borderColor: 'transparent',
    textColor: '#404060',
    scaleMargins: { top: 0.08, bottom: 0.08 },
  },
  timeScale: {
    borderColor: 'transparent',
    fixLeftEdge: true,
    fixRightEdge: true,
    timeVisible: false,
  },
  handleScroll: true,
  handleScale: true,
}

export default function TVChart({ data, height = 220, positive = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current || !data.length) return

    const chart = createChart(containerRef.current, {
      ...BASE_OPTS,
      width:  containerRef.current.clientWidth,
      height,
    })
    chartRef.current = chart

    const lineColor  = positive ? '#00ff41' : '#ff3b3b'
    const topFill    = positive ? 'rgba(0,255,65,0.25)' : 'rgba(255,59,59,0.22)'
    const bottomFill = positive ? 'rgba(0,255,65,0.00)' : 'rgba(255,59,59,0.00)'

    const series = chart.addAreaSeries({
      lineColor,
      topColor:    topFill,
      bottomColor: bottomFill,
      lineWidth:       2,
      crosshairMarkerRadius:          5,
      crosshairMarkerBorderColor:     lineColor,
      crosshairMarkerBorderWidth:     2,
      crosshairMarkerBackgroundColor: '#060606',
      priceLineColor:  positive ? 'rgba(0,255,65,0.25)' : 'rgba(255,59,59,0.25)',
      priceLineWidth:  1,
      priceLineStyle:  3,
      lastValueVisible: true,
      priceScaleId: 'right',
    })

    // Zero baseline
    chart.addLineSeries({
      color:                  'rgba(255,255,255,0.05)',
      lineWidth:              1,
      lineStyle:              2,
      priceLineVisible:       false,
      lastValueVisible:       false,
      crosshairMarkerVisible: false,
    }).setData(data.map(d => ({ time: d.time as any, value: 0 })))

    series.setData(data.map(d => ({ time: d.time as any, value: d.value })))
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)

    return () => { ro.disconnect(); chart.remove() }
  }, [data, height, positive])

  return <div ref={containerRef} style={{ width: '100%', height, background: 'transparent' }} />
}
