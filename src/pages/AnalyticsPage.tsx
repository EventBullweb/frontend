import { useEffect, useMemo, useState } from 'react'
import './AnalyticsPage.css'

interface TotalsStats {
  visitors: number
  registrations_completed: number
  tickets: number
  activated_tickets: number
  visitor_answers: number
  broadcast_deliveries: number
}

interface FunnelStats {
  visitors_total: number
  registrations_completed: number
  tickets_issued: number
  tickets_activated: number
  registration_completion_rate: number
  ticket_issue_rate_from_completed: number
  ticket_activation_rate_from_issued: number
  ticket_activation_rate_from_visitors: number
}

interface TicketsStats {
  expected: number
  already_activated: number
  not_activated: number
  with_lottery_code: number
  without_lottery_code: number
}

interface TopStep {
  step_key: string
  step_label: string
  answers_count: number
  unique_visitors: number
}

interface AnswersStats {
  total_answers: number
  unique_respondents: number
  average_answers_per_respondent: number
  top_steps: TopStep[]
}

interface BroadcastStats {
  total_deliveries: number
  unique_recipients: number
}

interface ProjectDetailedStats {
  totals: TotalsStats
  funnel: FunnelStats
  tickets: TicketsStats
  answers: AnswersStats
  broadcast: BroadcastStats
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '')

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value)
}

export default function AnalyticsPage() {
  const [data, setData] = useState<ProjectDetailedStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true)
      setError('')

      try {
        const response = await fetch(`${API_BASE_URL}/stats/project-detailed`)
        const payload = (await response.json().catch(() => null)) as unknown

        if (!response.ok) {
          throw new Error('Не удалось получить данные аналитики.')
        }

        setData(payload as ProjectDetailedStats)
      } catch (requestError) {
        const errorMessage =
          requestError instanceof Error ? requestError.message : 'Сетевая ошибка при загрузке аналитики.'
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    void fetchAnalytics()
  }, [])

  const topSteps = useMemo(() => data?.answers.top_steps ?? [], [data])

  if (isLoading) {
    return (
      <main className="analytics-page">
        <section className="analytics-card">
          <h1>Аналитика проекта</h1>
          <p className="analytics-hint">Загружаем данные...</p>
        </section>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="analytics-page">
        <section className="analytics-card">
          <h1>Аналитика проекта</h1>
          <div className="analytics-error">{error || 'Данные аналитики недоступны.'}</div>
        </section>
      </main>
    )
  }

  return (
    <main className="analytics-page">
      <section className="analytics-card">
        <header className="analytics-header">
          <h1>Аналитика проекта</h1>
          <p className="analytics-hint">Данные из endpoint `GET /stats/project-detailed`</p>
        </header>

        <section className="analytics-section">
          <h2>Totals</h2>
          <div className="analytics-grid">
            <article className="analytics-item">
              <span>Посетители</span>
              <strong>{formatNumber(data.totals.visitors)}</strong>
            </article>
            <article className="analytics-item">
              <span>Завершили регистрацию</span>
              <strong>{formatNumber(data.totals.registrations_completed)}</strong>
            </article>
            <article className="analytics-item">
              <span>Билеты</span>
              <strong>{formatNumber(data.totals.tickets)}</strong>
            </article>
            <article className="analytics-item">
              <span>Активированные билеты</span>
              <strong>{formatNumber(data.totals.activated_tickets)}</strong>
            </article>
            <article className="analytics-item">
              <span>Ответы анкет</span>
              <strong>{formatNumber(data.totals.visitor_answers)}</strong>
            </article>
            <article className="analytics-item">
              <span>Доставки рассылок</span>
              <strong>{formatNumber(data.totals.broadcast_deliveries)}</strong>
            </article>
          </div>
        </section>

        <section className="analytics-section">
          <h2>Funnel</h2>
          <div className="analytics-grid">
            <article className="analytics-item">
              <span>Посетителей всего</span>
              <strong>{formatNumber(data.funnel.visitors_total)}</strong>
            </article>
            <article className="analytics-item">
              <span>Завершили регистрацию</span>
              <strong>{formatNumber(data.funnel.registrations_completed)}</strong>
            </article>
            <article className="analytics-item">
              <span>Билетов выдано</span>
              <strong>{formatNumber(data.funnel.tickets_issued)}</strong>
            </article>
            <article className="analytics-item">
              <span>Билетов активировано</span>
              <strong>{formatNumber(data.funnel.tickets_activated)}</strong>
            </article>
            <article className="analytics-item">
              <span>Completion rate</span>
              <strong>{formatPercent(data.funnel.registration_completion_rate)}</strong>
            </article>
            <article className="analytics-item">
              <span>Issue rate</span>
              <strong>{formatPercent(data.funnel.ticket_issue_rate_from_completed)}</strong>
            </article>
            <article className="analytics-item">
              <span>Activation rate (issued)</span>
              <strong>{formatPercent(data.funnel.ticket_activation_rate_from_issued)}</strong>
            </article>
            <article className="analytics-item">
              <span>Activation rate (visitors)</span>
              <strong>{formatPercent(data.funnel.ticket_activation_rate_from_visitors)}</strong>
            </article>
          </div>
        </section>

        <section className="analytics-section">
          <h2>Tickets</h2>
          <div className="analytics-grid">
            <article className="analytics-item">
              <span>Всего ожидается</span>
              <strong>{formatNumber(data.tickets.expected)}</strong>
            </article>
            <article className="analytics-item">
              <span>Уже активировано</span>
              <strong>{formatNumber(data.tickets.already_activated)}</strong>
            </article>
            <article className="analytics-item">
              <span>Не активировано</span>
              <strong>{formatNumber(data.tickets.not_activated)}</strong>
            </article>
            <article className="analytics-item">
              <span>С lottery_code</span>
              <strong>{formatNumber(data.tickets.with_lottery_code)}</strong>
            </article>
            <article className="analytics-item">
              <span>Без lottery_code</span>
              <strong>{formatNumber(data.tickets.without_lottery_code)}</strong>
            </article>
          </div>
        </section>

        <section className="analytics-section">
          <h2>Answers</h2>
          <div className="analytics-grid">
            <article className="analytics-item">
              <span>Всего ответов</span>
              <strong>{formatNumber(data.answers.total_answers)}</strong>
            </article>
            <article className="analytics-item">
              <span>Уникальные респонденты</span>
              <strong>{formatNumber(data.answers.unique_respondents)}</strong>
            </article>
            <article className="analytics-item">
              <span>Среднее ответов на респондента</span>
              <strong>{data.answers.average_answers_per_respondent.toFixed(2)}</strong>
            </article>
          </div>

          <div className="analytics-table-wrap">
            <h3>Top steps</h3>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Ответов</th>
                  <th>Уникальных посетителей</th>
                </tr>
              </thead>
              <tbody>
                {topSteps.map((step) => (
                  <tr key={step.step_key}>
                    <td>{step.step_label}</td>
                    <td>{formatNumber(step.answers_count)}</td>
                    <td>{formatNumber(step.unique_visitors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="analytics-section">
          <h2>Broadcast</h2>
          <div className="analytics-grid">
            <article className="analytics-item">
              <span>Всего доставок</span>
              <strong>{formatNumber(data.broadcast.total_deliveries)}</strong>
            </article>
            <article className="analytics-item">
              <span>Уникальные получатели</span>
              <strong>{formatNumber(data.broadcast.unique_recipients)}</strong>
            </article>
          </div>
        </section>
      </section>
    </main>
  )
}
