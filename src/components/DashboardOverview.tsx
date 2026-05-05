import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowSquareOut,
  ChartBarHorizontal,
  Clock,
  CurrencyCircleDollar,
  Info,
  Receipt,
  Users,
  UserPlus,
  Wallet,
} from '@phosphor-icons/react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Activity, Expense, Group, Member, TripInfo } from '@/lib/supabase-service'
import { getWorkspaceDisplayName } from '@/lib/workspace-preferences'

type DashboardOverviewProps = {
  expenses: Expense[]
  activities: Activity[]
  members: Member[]
  tripInfo: TripInfo[]
  currentGroup: Group | null
  isPersonalWorkspace: boolean
  onOpenExpenses: () => void
  onOpenAnalytics: () => void
  onOpenWorkspace: () => void
  onInviteMembers?: () => void
}

const amountFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactAmountFormatter = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const formatAmount = (value: number) => amountFormatter.format(Number.isFinite(value) ? value : 0)
const formatAmountCompact = (value: number) => compactAmountFormatter.format(Number.isFinite(value) ? value : 0)

const formatTimestamp = (value?: string) => {
  if (!value) return 'Just now'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Just now'
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function DashboardOverview({
  expenses,
  activities,
  members,
  tripInfo,
  currentGroup,
  isPersonalWorkspace,
  onOpenExpenses,
  onOpenAnalytics,
  onOpenWorkspace,
  onInviteMembers,
}: DashboardOverviewProps) {
  const metrics = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    let totalSpend = 0
    let monthSpend = 0

    for (const expense of expenses) {
      const amount = Number(expense.amount || 0)
      totalSpend += amount

      const occurred = new Date(expense.date)
      if (!Number.isNaN(occurred.getTime()) && occurred.getMonth() === currentMonth && occurred.getFullYear() === currentYear) {
        monthSpend += amount
      }
    }

    return {
      totalSpend,
      monthSpend,
      expenseCount: expenses.length,
      memberCount: members.length,
      noteCount: tripInfo.length,
      activityCount: activities.length,
    }
  }, [expenses, members.length, tripInfo.length, activities.length])

  const topCategories = useMemo(() => {
    const map = new Map<string, number>()
    for (const expense of expenses) {
      const key = expense.category || 'Other'
      map.set(key, (map.get(key) || 0) + Number(expense.amount || 0))
    }

    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [expenses])

  const monthlyTrend = useMemo(() => {
    const now = new Date()
    const monthBuckets = Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
      return {
        key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
        label: monthDate.toLocaleString(undefined, { month: 'short' }),
        month: monthDate.toLocaleString(undefined, { month: 'short', year: 'numeric' }),
        amount: 0,
      }
    })

    const bucketMap = new Map(monthBuckets.map((bucket) => [bucket.key, bucket]))

    for (const expense of expenses) {
      const parsed = new Date(expense.date)
      if (Number.isNaN(parsed.getTime())) continue

      const key = `${parsed.getFullYear()}-${parsed.getMonth()}`
      const bucket = bucketMap.get(key)
      if (!bucket) continue

      bucket.amount += Number(expense.amount || 0)
    }

    return monthBuckets
  }, [expenses])

  const recentActivities = activities.slice(0, 6)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Dashboard</p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {getWorkspaceDisplayName(currentGroup) || 'Workspace overview'}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Monitor spend, member activity, and workspace health in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={isPersonalWorkspace ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' : 'border-sky-500/40 text-sky-700 dark:text-sky-400'}>
              {isPersonalWorkspace ? 'Personal Workspace' : 'Shared Workspace'}
            </Badge>
            {!isPersonalWorkspace && <Badge variant="secondary">{metrics.memberCount} members</Badge>}
            <Badge variant="secondary">{metrics.expenseCount} expenses</Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onOpenExpenses}>
            <Receipt className="mr-2 h-4 w-4" />
            Manage expenses
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenAnalytics}>
            <ChartBarHorizontal className="mr-2 h-4 w-4" />
            View analytics
          </Button>
          {!isPersonalWorkspace && onInviteMembers && (
            <Button size="sm" variant="outline" onClick={onInviteMembers}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite members
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onOpenWorkspace}>
            <Users className="mr-2 h-4 w-4" />
            Workspace settings
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel-card p-4">
          <div className="mb-2 flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Total spend</span>
            <Wallet className="h-4 w-4" />
          </div>
          <p className="text-2xl font-semibold">₹{formatAmount(metrics.totalSpend)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Across all recorded expenses</p>
        </div>

        <div className="panel-card p-4">
          <div className="mb-2 flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">This month</span>
            <CurrencyCircleDollar className="h-4 w-4" />
          </div>
          <p className="text-2xl font-semibold">₹{formatAmount(metrics.monthSpend)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Current month spending trend</p>
        </div>

        <div className="panel-card p-4">
          <div className="mb-2 flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Activity</span>
            <Clock className="h-4 w-4" />
          </div>
          <p className="text-2xl font-semibold">{metrics.activityCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Recent events captured</p>
        </div>

        <div className="panel-card p-4">
          <div className="mb-2 flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Notes</span>
            <Info className="h-4 w-4" />
          </div>
          <p className="text-2xl font-semibold">{metrics.noteCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Saved workspace notes</p>
        </div>
      </section>

      <section className="panel-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold tracking-tight">Spend trend</h4>
          <Badge variant="outline">Last 6 months</Badge>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.45} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickFormatter={(value) => `₹${formatAmountCompact(Number(value))}`}
              />
              <Tooltip
                formatter={(value: number) => [`₹${formatAmount(Number(value))}`, 'Spend']}
                labelFormatter={(label: string, payload) => payload?.[0]?.payload?.month || label}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                  color: 'var(--foreground)',
                }}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="var(--chart-1)"
                strokeWidth={3}
                dot={{ r: 4, fill: 'var(--chart-1)', stroke: 'var(--background)', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: 'var(--chart-1)', stroke: 'var(--background)', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold tracking-tight">Top categories</h4>
            <Badge variant="outline">Spend distribution</Badge>
          </div>

          {topCategories.length ? (
            <div className="space-y-2">
              {topCategories.map(([category, amount]) => {
                const ratio = metrics.totalSpend > 0 ? Math.round((amount / metrics.totalSpend) * 100) : 0
                return (
                  <div key={category} className="rounded-lg border border-border/50 bg-background/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">{category}</p>
                      <p className="text-sm font-semibold">₹{formatAmount(amount)}</p>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted/60">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(ratio, 4)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ratio}% of total</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              No expense categories yet. Add your first expense to populate insights.
            </div>
          )}
        </div>

        <div className="panel-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold tracking-tight">Recent activity</h4>
            <Button variant="ghost" size="sm" onClick={onOpenExpenses}>
              Open module
              <ArrowSquareOut className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {recentActivities.length ? (
            <div className="space-y-2">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="rounded-lg border border-border/50 bg-background/60 p-3">
                  <p className="text-sm font-medium text-foreground/95">{activity.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{activity.user} · {formatTimestamp(activity.timestamp)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              Activity feed is empty for this workspace.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
