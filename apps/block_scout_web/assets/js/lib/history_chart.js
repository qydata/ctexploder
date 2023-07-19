import $ from 'jquery'
import { Chart, LineController, LineElement, PointElement, LinearScale, TimeScale, Title, Tooltip } from 'chart.js'
import 'chartjs-adapter-moment'
import humps from 'humps'
import numeral from 'numeral'
import moment from 'moment'
require('moment/locale/zh-cn')
import { formatUsdValue } from '../lib/currency'
import sassVariables from '../../css/export-vars-to-js.module.scss'

Chart.defaults.font.family = 'Nunito, "Helvetica Neue", Arial, sans-serif,"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'
Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Title, Tooltip)

const grid = {
  display: false,
  drawBorder: false,
  drawOnChartArea: false
}

function xAxe (fontColor) {
  return {
    grid: grid,
    type: 'time',
    time: {
      unit: 'day',
      tooltipFormat: 'YYYY-MM-DD',
      stepSize: 14
    },
    ticks: {
      color: fontColor
    }
  }
}

const padding = {
  left: 20,
  right: 20
}

const legend = {
  display: false
}

function formatValue (val) {
  return `${numeral(val).format('0,0')}`
}

const config = {
  type: 'line',
  responsive: true,
  data: {
    datasets: []
  },
  options: {
    layout: {
      padding: padding
    },
    interaction: {
      intersect: false,
      mode: 'index'
    },
    scales: {
      x: xAxe(sassVariables.dashboardBannerChartAxisFontColor),
      price: {
        position: 'left',
        grid: grid,
        ticks: {
          beginAtZero: true,
          callback: (value, _index, _values) => `$${numeral(value).format('0,0.00')}`,
          maxTicksLimit: 4,
          color: sassVariables.dashboardBannerChartAxisFontColor
        }
      },
      marketCap: {
        position: 'right',
        grid: grid,
        ticks: {
          callback: (_value, _index, _values) => '',
          maxTicksLimit: 6,
          drawOnChartArea: false,
          color: sassVariables.dashboardBannerChartAxisFontColor
        }
      },
      numTransactions: {
        position: 'right',
        grid: grid,
        ticks: {
          beginAtZero: true,
          callback: (value, _index, _values) => formatValue(value),
          maxTicksLimit: 4,
          color: sassVariables.dashboardBannerChartAxisFontColor
        }
      }
    },
    plugins: {
      legend: legend,
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (context) => {
            const { label } = context.dataset
            const { formattedValue, parsed } = context
            if (context.dataset.yAxisID === 'price') {
              return `${label}: ${formatUsdValue(parsed.y)}`
            } else if (context.dataset.yAxisID === 'marketCap') {
              return `${label}: ${formatUsdValue(parsed.y)}`
            } else if (context.dataset.yAxisID === 'numTransactions') {
              return `${label}: ${formattedValue}`
            } else {
              return formattedValue
            }
          }
        }
      }
    }
  }
}

function getDataFromLocalStorage (key) {
  const data = window.localStorage.getItem(key)
  return data ? JSON.parse(data) : []
}

function setDataToLocalStorage (key, data) {
  window.localStorage.setItem(key, JSON.stringify(data))
}

function getPriceData (marketHistoryData) {
  if (marketHistoryData.length === 0) {
    return getDataFromLocalStorage('priceData')
  }
  const data = marketHistoryData.map(({ date, closingPrice }) => ({ x: date, y: closingPrice }))
  setDataToLocalStorage('priceData', data)
  return data
}

function getTxHistoryData (transactionHistory) {
  if (transactionHistory.length === 0) {
    return getDataFromLocalStorage('txHistoryData')
  }
  const data = transactionHistory.map(dataPoint => ({ x: dataPoint.date, y: dataPoint.number_of_transactions }))

  // it should be empty value for tx history the current day
  const prevDayStr = data[0].x
  const prevDay = moment(prevDayStr)
  let curDay = prevDay.add(1, 'days')
  curDay = curDay.format('YYYY-MM-DD')
  data.unshift({ x: curDay, y: null })

  setDataToLocalStorage('txHistoryData', data)
  return data
}

function getMarketCapData (marketHistoryData, availableSupply) {
  if (marketHistoryData.length === 0) {
    return getDataFromLocalStorage('marketCapData')
  }
  const data = marketHistoryData.map(({ date, closingPrice }) => {
    const supply = (availableSupply !== null && typeof availableSupply === 'object')
      ? availableSupply[date]
      : availableSupply
    return { x: date, y: closingPrice * supply }
  })
  setDataToLocalStorage('marketCapData', data)
  return data
}

// colors for light and dark theme
const priceLineColor = sassVariables.dashboardLineColorPrice
const mcapLineColor = sassVariables.dashboardLineColorMarket

class MarketHistoryChart {
  constructor (el, availableSupply, _marketHistoryData, dataConfig) {
    const axes = config.options.scales

    let priceActivated = true
    let marketCapActivated = true

    this.price = {
      label: window.localized.Price,
      yAxisID: 'price',
      data: [],
      fill: false,
      cubicInterpolationMode: 'monotone',
      pointRadius: 0,
      backgroundColor: priceLineColor,
      borderColor: priceLineColor
      // lineTension: 0
    }
    if (dataConfig.market === undefined || dataConfig.market.indexOf('price') === -1) {
      this.price.hidden = true
      axes.price.display = false
      priceActivated = false
    }

    this.marketCap = {
      label: window.localized['Market Cap'],
      yAxisID: 'marketCap',
      data: [],
      fill: false,
      cubicInterpolationMode: 'monotone',
      pointRadius: 0,
      backgroundColor: mcapLineColor,
      borderColor: mcapLineColor
      // lineTension: 0
    }
    if (dataConfig.market === undefined || dataConfig.market.indexOf('market_cap') === -1) {
      this.marketCap.hidden = true
      axes.marketCap.display = false
      marketCapActivated = false
    }

    this.numTransactions = {
      label: window.localized['Tx/day'],
      yAxisID: 'numTransactions',
      data: [],
      cubicInterpolationMode: 'monotone',
      fill: false,
      pointRadius: 0,
      backgroundColor: sassVariables.dashboardLineColorTransactions,
      borderColor: sassVariables.dashboardLineColorTransactions
      // lineTension: 0
    }

    if (dataConfig.transactions === undefined || dataConfig.transactions.indexOf('transactions_per_day') === -1) {
      this.numTransactions.hidden = true
      axes.numTransactions.display = false
    } else if (!priceActivated && !marketCapActivated) {
      axes.numTransactions.position = 'left'
      this.numTransactions.backgroundColor = sassVariables.dashboardLineColorPrice
      this.numTransactions.borderColor = sassVariables.dashboardLineColorPrice
    }

    this.availableSupply = availableSupply
    config.data.datasets = [this.price, this.marketCap, this.numTransactions]

    const isChartLoadedKey = 'isChartLoaded'
    const isChartLoaded = window.sessionStorage.getItem(isChartLoadedKey) === 'true'
    if (isChartLoaded) {
      config.options.animation = false
    } else {
      window.sessionStorage.setItem(isChartLoadedKey, true)
    }

    this.chart = new Chart(el, config)
  }

  updateMarketHistory (availableSupply, marketHistoryData) {
    this.price.data = getPriceData(marketHistoryData)
    if (this.availableSupply !== null && typeof this.availableSupply === 'object') {
      const today = new Date().toJSON().slice(0, 10)
      this.availableSupply[today] = availableSupply
      this.marketCap.data = getMarketCapData(marketHistoryData, this.availableSupply)
    } else {
      this.marketCap.data = getMarketCapData(marketHistoryData, availableSupply)
    }
    this.chart.update()
  }

  updateTransactionHistory (transactionHistory) {
    this.numTransactions.data = getTxHistoryData(transactionHistory)
    this.chart.update()
  }
}

export function createMarketHistoryChart (el) {
  const dataPaths = $(el).data('history_chart_paths')
  const dataConfig = $(el).data('history_chart_config')

  const $chartError = $('[data-chart-error-message]')
  const chart = new MarketHistoryChart(el, 0, [], dataConfig)
  Object.keys(dataPaths).forEach(function (historySource) {
    $.getJSON(dataPaths[historySource], { type: 'JSON' })
      .done(data => {
        switch (historySource) {
          case 'market': {
            const availableSupply = JSON.parse(data.supply_data)
            const marketHistoryData = humps.camelizeKeys(JSON.parse(data.history_data))

            $(el).show()
            chart.updateMarketHistory(availableSupply, marketHistoryData)
            break
          }
          case 'transaction': {
            const txsHistoryData = JSON.parse(data.history_data)

            $(el).show()
            chart.updateTransactionHistory(txsHistoryData)
            break
          }
        }
      })
      .fail(() => {
        $chartError.show()
      })
  })
  return chart
}

$('[data-chart-error-message]').on('click', _event => {
  $('[data-chart-error-message]').hide()
  createMarketHistoryChart($('[data-chart="historyChart"]')[0])
})