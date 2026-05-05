import { useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart,
} from 'recharts'
import { Activity, Expense, Member } from '@/lib/supabase-service'
import { format, parseISO, startOfDay, differenceInDays } from 'date-fns'
import { TrendUp, TrendDown, CurrencyDollar, Users, Calendar, ChartPie, Download } from '@phosphor-icons/react'
import { exportToPDF } from '@/lib/pdf-export'
import { toast } from 'sonner'

interface AnalyticsTabProps {
  expenses: Expense[]
  activities: Activity[]
  members: Member[]
  isPersonalWorkspace?: boolean
}

const CHART_COLORS = [
  '#3b82f6',
  '#64748b',
  '#475569',
  '#1d4ed8',
  '#0f172a',
  '#94a3b8',
  '#334155',
  '#1e293b',
]

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '10px',
  boxShadow: '0 10px 18px -12px rgba(15, 23, 42, 0.45)',
}

const CHART_TOOLTIP_LABEL_STYLE = {
  color: 'var(--foreground)',
  fontWeight: 600,
  marginBottom: '4px',
}

const CHART_TOOLTIP_ITEM_STYLE = {
  color: 'var(--foreground)',
  padding: '2px 0',
}

// Custom styled axis tick component
const CustomAxisTick = ({ x, y, payload, axis = 'x' }: any) => {
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={axis === 'x' ? 16 : 4}
        dx={axis === 'y' ? -10 : 0}
        textAnchor={axis === 'x' ? 'middle' : 'end'}
        fill="currentColor"
        className="text-xs fill-foreground"
      >
        {payload.value}
      </text>
    </g>
  )
}

// Custom legend with avatars for radar chart
const CustomLegend = ({ members }: { members: Member[] }) => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
      {members.map((member, index) => {
        const color = CHART_COLORS[index % CHART_COLORS.length]
        return (
          <div key={member.id} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <div className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <span className="text-sm font-medium">{member.name}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const AnalyticsTab = ({ expenses, activities, members, isPersonalWorkspace = false }: AnalyticsTabProps) => {
  // Create refs for charts
  const expensesByCategoryRef = useRef<HTMLDivElement>(null)
  const expensesByMemberRef = useRef<HTMLDivElement>(null)
  const expensesOverTimeRef = useRef<HTMLDivElement>(null)
  const memberSpendingRef = useRef<HTMLDivElement>(null)
  const memberBalancesRef = useRef<HTMLDivElement>(null)

  // Filter out transfer type expenses
  const analyticsExpenses = expenses.filter((e) => e.splitType !== 'transfer')

  // Handle PDF export
  const handleExportPDF = async () => {
    try {
      await exportToPDF(expenses, members, {
        expensesByCategory: expensesByCategoryRef.current,
        expensesByMember: expensesByMemberRef.current,
        expensesOverTime: expensesOverTimeRef.current,
        memberSpending: memberSpendingRef.current,
        memberBalances: memberBalancesRef.current,
      })
      toast.success('PDF exported successfully!')
    } catch (error) {
      console.error('PDF export failed:', error)
      toast.error('Failed to export PDF')
    }
  }

  // Calculate total expenses
  const totalExpenses = useMemo(
    () => analyticsExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [analyticsExpenses]
  )

  // Calculate expenses by category
  const expensesByCategory = useMemo(() => {
    const categoryMap = new Map<string, number>()
    analyticsExpenses.forEach((expense) => {
      const current = categoryMap.get(expense.category) || 0
      categoryMap.set(expense.category, current + expense.amount)
    })
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [analyticsExpenses])

  // Calculate expenses by member (who paid)
  const expensesByMember = useMemo(() => {
    const memberMap = new Map<string, number>()
    const shareMap = new Map<string, number>()
    
    // Initialize share map
    members.forEach((member) => {
      shareMap.set(member.id, 0)
    })
    
    expenses.forEach((expense) => {
      if (expense.category === 'Transfer') {
        // For transfers: sender's outgoing increases
        const sender = memberMap.get(expense.paidBy) || 0
        memberMap.set(expense.paidBy, sender + expense.amount)
        
        // Receiver's outgoing decreases
        Object.entries(expense.splits).forEach(([memberId, amount]) => {
          const receiver = memberMap.get(memberId) || 0
          memberMap.set(memberId, receiver - amount)
        })
      } else {
        // Regular expenses: add to outgoing
        const current = memberMap.get(expense.paidBy) || 0
        memberMap.set(expense.paidBy, current + expense.amount)
        
        // Track each member's share
        Object.entries(expense.splits).forEach(([memberId, amount]) => {
          const share = shareMap.get(memberId) || 0
          shareMap.set(memberId, share + amount)
        })
      }
    })
    return Array.from(memberMap.entries()).map(([memberId, value]) => {
      const member = members.find((m) => m.id === memberId)
      const share = shareMap.get(memberId) || 0
      return { name: member?.name || memberId, value, share, color: member?.color }
    })
  }, [expenses, members])

  // Calculate how much each member owes/is owed
  const memberBalances = useMemo(() => {
    const balances = new Map<string, { paid: number; share: number }>()
    
    members.forEach((member) => {
      balances.set(member.id, { paid: 0, share: 0 })
    })

    expenses.forEach((expense) => {
      if (expense.category === 'Transfer') {
        // Transfer: sender paid out money, receiver got money
        // Both should affect paid amounts to track the loan/debt
        const sender = balances.get(expense.paidBy)
        if (sender) {
          sender.paid += expense.amount
        }
        
        // Receiver got money (track as negative paid / credit)
        Object.entries(expense.splits).forEach(([memberId, amount]) => {
          const receiver = balances.get(memberId)
          if (receiver) {
            receiver.paid -= amount // Reduce paid since they received money
          }
        })
        // Note: share stays the same - transfers don't change expense share
      } else {
        // Regular expense: track who paid
        const payer = balances.get(expense.paidBy)
        if (payer) {
          payer.paid += expense.amount
        }

        // Track each member's share (their portion of expenses)
        Object.entries(expense.splits).forEach(([memberId, amount]) => {
          const member = balances.get(memberId)
          if (member) {
            member.share += amount
          }
        })
      }
    })

    return Array.from(balances.entries()).map(([memberId, { paid, share }]) => {
      const member = members.find((m) => m.id === memberId)
      const balance = paid - share
      return {
        name: member?.name || memberId,
        myShare: share, // My portion of all expenses (what I'm responsible for)
        paid, // Total amount I paid
        shouldReceive: balance > 0 ? balance : 0, // Amount I should get back
        iOwe: balance < 0 ? balance : 0, // Amount I need to give (negative value for chart)
        iOweAbs: balance < 0 ? Math.abs(balance) : 0, // Absolute value for display
        balance, // Keep for reference
        color: member?.color,
      }
    })
  }, [expenses, members])

  // Calculate expenses over time
  const expensesOverTime = useMemo(() => {
    if (analyticsExpenses.length === 0) return []

    const dateMap = new Map<string, number>()
    analyticsExpenses.forEach((expense) => {
      const date = format(parseISO(expense.date), 'MMM dd')
      const current = dateMap.get(date) || 0
      dateMap.set(date, current + expense.amount)
    })

    return Array.from(dateMap.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => {
        const dateA = new Date(a.date + ', 2024')
        const dateB = new Date(b.date + ', 2024')
        return dateA.getTime() - dateB.getTime()
      })
  }, [analyticsExpenses])

  // Calculate cumulative expenses
  const cumulativeExpenses = useMemo(() => {
    if (expensesOverTime.length === 0) return []

    let cumulative = 0
    return expensesOverTime.map((item) => {
      cumulative += item.amount
      return { ...item, cumulative }
    })
  }, [expensesOverTime])

  // Calculate average expense per day
  const averageExpensePerDay = useMemo(() => {
    if (analyticsExpenses.length === 0) return 0

    const dates = analyticsExpenses.map((e) => startOfDay(parseISO(e.date)))
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))
    const days = differenceInDays(maxDate, minDate) + 1

    return totalExpenses / days
  }, [analyticsExpenses, totalExpenses])

  // Activity statistics
  const activityStats = useMemo(() => {
    const typeMap = new Map<string, number>()
    activities.forEach((activity) => {
      const type = activity.type.replace(/_/g, ' ')
      const current = typeMap.get(type) || 0
      typeMap.set(type, current + 1)
    })
    return Array.from(typeMap.entries()).map(([name, value]) => ({ name, value }))
  }, [activities])

  // Member contribution radar chart data
  const memberRadarData = useMemo(() => {
    const categories = [...new Set(analyticsExpenses.map((e) => e.category))]
    
    return categories.map((category) => {
      const dataPoint: any = { category }
      
      members.forEach((member) => {
        const memberExpenses = analyticsExpenses.filter((e) => e.category === category)
        
        let totalSplit = 0
        memberExpenses.forEach((expense) => {
          // Use the same split amounts shown in Bills tab
          // For all split types, the calculated amount is in expense.splits[member.id]
          const memberAmount = expense.splits?.[member.id] || 0
          totalSplit += memberAmount
        })
        
        dataPoint[member.name] = parseFloat(totalSplit.toFixed(2))
      })
      
      return dataPoint
    })
  }, [analyticsExpenses, members])

  // Calculate statistics
  // Calculate statistics
  const avgExpenseAmount = useMemo(
    () => (analyticsExpenses.length > 0 ? totalExpenses / analyticsExpenses.length : 0),
    [totalExpenses, analyticsExpenses.length]
  )

  const largestExpense = useMemo(
    () => analyticsExpenses.reduce((max, e) => (e.amount > max.amount ? e : max), analyticsExpenses[0] || { amount: 0 }),
    [analyticsExpenses]
  )

  const topExpenses = useMemo(
    () => [...analyticsExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5),
    [analyticsExpenses]
  )

  const mostSpentCategory = expensesByCategory[0] || null

  const activeDaysCount = useMemo(
    () => new Set(analyticsExpenses.map((expense) => format(parseISO(expense.date), 'MMM dd, yyyy'))).size,
    [analyticsExpenses]
  )

  const mostActiveDay = useMemo(() => {
    const dayMap = new Map<string, number>()
    analyticsExpenses.forEach((expense) => {
      const date = format(parseISO(expense.date), 'MMM dd, yyyy')
      const current = dayMap.get(date) || 0
      dayMap.set(date, current + 1)
    })
    
    let maxDay = ''
    let maxCount = 0
    dayMap.forEach((count, date) => {
      if (count > maxCount) {
        maxCount = count
        maxDay = date
      }
    })
    
    return { date: maxDay, count: maxCount }
  }, [analyticsExpenses])

  if (isPersonalWorkspace) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button
            onClick={handleExportPDF}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" weight="bold" />
            Export to PDF
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border border-border/70 bg-card/80 transition-colors hover:bg-accent/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Personal Spend</CardTitle>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <CurrencyDollar className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                ₹{totalExpenses.toFixed(2)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Across {analyticsExpenses.length} transactions
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/80 transition-colors hover:bg-accent/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average/Day</CardTitle>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                ₹{averageExpensePerDay.toFixed(2)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Daily spending rate</p>
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/80 transition-colors hover:bg-accent/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Category</CardTitle>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <ChartPie className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="truncate text-2xl font-bold text-foreground">
                {mostSpentCategory?.name || 'N/A'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {mostSpentCategory ? `₹${mostSpentCategory.value.toFixed(2)} spent here` : 'No category data yet'}
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/80 transition-colors hover:bg-accent/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Largest Expense</CardTitle>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <TrendDown className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                ₹{largestExpense.amount.toFixed(2)}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {largestExpense.description || 'N/A'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="overflow-hidden border border-border/70 bg-card/80" ref={expensesByCategoryRef}>
                <CardHeader>
                  <CardTitle>Personal Spending by Category</CardTitle>
                  <CardDescription>Where your money went</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <defs>
                        {CHART_COLORS.map((color, index) => (
                          <linearGradient key={index} id={`personal-gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie
                        data={expensesByCategory}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={90}
                        fill={CHART_COLORS[0]}
                        dataKey="value"
                        strokeWidth={2}
                        stroke="hsl(var(--background))"
                      >
                        {expensesByCategory.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => `₹${value.toFixed(2)}`}
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                        itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                        cursor={false}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border border-border/70 bg-card/80" ref={expensesByMemberRef}>
                <CardHeader>
                  <CardTitle>Top Expenses</CardTitle>
                  <CardDescription>Your biggest transactions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-6">
                  {topExpenses.length > 0 ? (
                    topExpenses.map((expense, index) => (
                      <div key={expense.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{index + 1}. {expense.description || 'Untitled expense'}</p>
                          <p className="text-xs text-muted-foreground">{expense.category} · {format(parseISO(expense.date), 'dd MMM yyyy')}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-foreground">₹{expense.amount.toFixed(2)}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
                      No expenses recorded yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="overflow-hidden border border-border/70 bg-card/80" ref={memberSpendingRef}>
                <CardHeader>
                  <CardTitle>Personal Snapshot</CardTitle>
                  <CardDescription>Quick summary of your spending pattern</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                      <span className="text-sm font-medium">Active Days</span>
                      <span className="text-lg font-bold text-foreground">{activeDaysCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                      <span className="text-sm font-medium">Most Active Day</span>
                      <span className="text-sm font-semibold text-foreground">{mostActiveDay.date || 'N/A'}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                      <span className="text-sm font-medium">Transactions</span>
                      <span className="text-lg font-bold text-foreground">{analyticsExpenses.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                      <span className="text-sm font-medium">Average Expense</span>
                      <span className="text-lg font-bold text-foreground">₹{avgExpenseAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border border-border/70 bg-card/80" ref={memberBalancesRef}>
                <CardHeader>
                  <CardTitle>Spending Highlights</CardTitle>
                  <CardDescription>What stands out the most</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                      <p className="text-xs font-medium text-muted-foreground">Highest spend</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">₹{largestExpense.amount.toFixed(2)} {largestExpense.description ? `· ${largestExpense.description}` : ''}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                      <p className="text-xs font-medium text-muted-foreground">Top category</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{mostSpentCategory?.name || 'N/A'}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                      <p className="text-xs font-medium text-muted-foreground">Daily pace</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">₹{averageExpensePerDay.toFixed(2)} per day</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                      <p className="text-xs font-medium text-muted-foreground">Transactions tracked</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{analyticsExpenses.length} entries</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <Card className="overflow-hidden border border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
                <CardDescription>Detailed view of your expenses by category</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={expensesByCategory} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      {expensesByCategory.map((entry, index) => (
                        <linearGradient key={index} id={`categoryGradient-${index}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.9} />
                          <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.6} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" tick={<CustomAxisTick axis="x" />} />
                    <YAxis dataKey="name" type="category" width={120} tick={<CustomAxisTick axis="y" />} />
                    <Tooltip
                      formatter={(value: number) => `₹${value.toFixed(2)}`}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={false}
                    />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                      {expensesByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#categoryGradient-${index})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle>Category Details</CardTitle>
                <CardDescription>Statistics for each category</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {expensesByCategory.map((category, index) => {
                    const categoryExpenses = expenses.filter((e) => e.category === category.name)
                    const percentage = totalExpenses > 0 ? (category.value / totalExpenses) * 100 : 0
                    const color = CHART_COLORS[index % CHART_COLORS.length]
                    return (
                      <div key={category.name} className="space-y-2 rounded-lg border border-border/60 bg-card/60 p-4 transition-colors hover:bg-accent/20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-5 w-5 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-lg font-semibold">{category.name}</span>
                          </div>
                          <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground">
                            {categoryExpenses.length} transactions
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="mr-3 h-3 flex-1 overflow-hidden rounded-full bg-secondary shadow-inner">
                            <div
                              className="h-3 rounded-full transition-all duration-500 ease-out"
                              style={{
                                width: `${percentage}%`,
                                background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
                              }}
                            />
                          </div>
                          <span className="text-lg font-bold" style={{ color: color }}>₹{category.value.toFixed(2)}</span>
                        </div>
                        <p className="inline-block rounded-full bg-primary/5 px-3 py-1.5 text-xs font-medium" style={{ color: color }}>
                          {percentage.toFixed(1)}% of your total spend
                        </p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4">
            <Card className="overflow-hidden border border-border/70 bg-card/80" ref={expensesOverTimeRef}>
              <CardHeader>
                <CardTitle>Spending Over Time</CardTitle>
                <CardDescription>Daily spend and cumulative growth</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={350}>
                  <ComposedChart data={expensesOverTime} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={<CustomAxisTick axis="x" />} />
                    <YAxis tick={<CustomAxisTick axis="y" />} />
                    <Tooltip
                      formatter={(value: number) => `₹${value.toFixed(2)}`}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={false}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      name="Daily Spend"
                      stroke={CHART_COLORS[0]}
                      strokeWidth={3}
                      dot={{ fill: CHART_COLORS[0], strokeWidth: 2, r: 4 }}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border border-border/70 bg-card/80" ref={memberSpendingRef}>
              <CardHeader>
                <CardTitle>Cumulative Spend</CardTitle>
                <CardDescription>How your spending has built up over time</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={cumulativeExpenses} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={<CustomAxisTick axis="x" />} />
                    <YAxis tick={<CustomAxisTick axis="y" />} />
                    <Tooltip
                      formatter={(value: number) => `₹${value.toFixed(2)}`}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative Spend"
                      stroke={CHART_COLORS[1]}
                      strokeWidth={2}
                      fill="url(#cumulativeGradient)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Export Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleExportPDF}
          variant="outline"
          className="gap-2"
        >
          <Download className="h-4 w-4" weight="bold" />
          Export to PDF
        </Button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-border/70 bg-card/80 transition-colors hover:bg-accent/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <CurrencyDollar className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              ₹{totalExpenses.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {expenses.length} transactions
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card/80 transition-colors hover:bg-accent/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average/Day</CardTitle>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              ₹{averageExpensePerDay.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Daily spending rate</p>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card/80 transition-colors hover:bg-accent/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Expense</CardTitle>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendUp className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              ₹{avgExpenseAmount.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per transaction</p>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card/80 transition-colors hover:bg-accent/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Largest Expense</CardTitle>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendDown className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              ₹{largestExpense.amount.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {largestExpense.description || 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden border border-border/70 bg-card/80" ref={expensesByCategoryRef}>
              <CardHeader>
                <CardTitle>Expense Distribution by Category</CardTitle>
                <CardDescription>Total spending across categories</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <defs>
                      {CHART_COLORS.map((color, index) => (
                        <linearGradient key={index} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={expensesByCategory}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={90}
                      fill={CHART_COLORS[0]}
                      dataKey="value"
                      strokeWidth={2}
                      stroke="hsl(var(--background))"
                    >
                      {expensesByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `₹${value.toFixed(2)}`}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={false}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border border-border/70 bg-card/80" ref={expensesByMemberRef}>
              <CardHeader>
                <CardTitle>Expenses by Member</CardTitle>
                <CardDescription>Who paid for what</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={expensesByMember} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      {expensesByMember.map((entry, index) => (
                        <linearGradient key={index} id={`memberGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.9} />
                          <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.6} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="name" tick={<CustomAxisTick axis="x" />} />
                    <YAxis tick={<CustomAxisTick axis="y" />} />
                    <Tooltip 
                      formatter={(value: number) => `₹${value.toFixed(2)}`}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={false}
                    />
                    <Legend />
                    <Bar dataKey="value" name="Paid Out" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                      {expensesByMember.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#memberGradient-${index})`} />
                      ))}
                    </Bar>
                    <Line 
                      type="monotone" 
                      dataKey="share" 
                      name="My Share"
                      stroke={CHART_COLORS[0]} 
                      strokeWidth={3}
                      dot={{ fill: CHART_COLORS[0], strokeWidth: 2, r: 5 }}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden border border-border/70 bg-card/80" ref={memberBalancesRef}>
            <CardHeader>
              <CardTitle>Member Balances</CardTitle>
              <CardDescription>My share vs what I paid, with settlements in opposite directions</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={memberBalances} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="shareGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="paidGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="receiveGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="oweGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#dc2626" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="name" tick={<CustomAxisTick axis="x" />} />
                  <YAxis tick={<CustomAxisTick axis="y" />} />
                  <Tooltip 
                    formatter={(value: number) => `₹${value.toFixed(2)}`}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    cursor={false}
                  />
                  <Legend />
                  <Bar dataKey="myShare" fill="url(#shareGradient)" name="My Share (Expenses)" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="paid" fill="url(#paidGradient)" name="Amount Paid" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="balance" name="Settlement (↑Receive / ↓Owe)" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                    {memberBalances.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.balance >= 0 ? 'url(#receiveGradient)' : 'url(#oweGradient)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden border border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle>Activity Distribution</CardTitle>
                <CardDescription>Types of activities performed</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={activityStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill={CHART_COLORS[0]}
                      dataKey="value"
                      strokeWidth={2}
                      stroke="hsl(var(--background))"
                    >
                      {activityStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={false}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
                <CardDescription>Additional insights</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/60">
                  <span className="text-sm font-medium">Total Transactions</span>
                  <span className="text-2xl font-bold text-foreground">{expenses.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/60">
                  <span className="text-sm font-medium">Total Activities</span>
                  <span className="text-2xl font-bold text-foreground">{activities.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/60">
                  <span className="text-sm font-medium">Active Members</span>
                  <span className="text-2xl font-bold text-foreground">{members.length}</span>
                </div>
                <div className="flex flex-col p-3 bg-muted/30 rounded-lg border border-border/60">
                  <span className="text-sm font-medium text-muted-foreground">Most Active Day</span>
                  <span className="text-lg font-bold text-foreground">{mostActiveDay.date || 'N/A'}</span>
                  <span className="text-xs text-muted-foreground">
                    {mostActiveDay.count} transactions
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card className="overflow-hidden border border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle>Category Breakdown</CardTitle>
              <CardDescription>Detailed view of expenses by category</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={expensesByCategory} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    {expensesByCategory.map((entry, index) => (
                      <linearGradient key={index} id={`categoryGradient-${index}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.6} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" tick={<CustomAxisTick axis="x" />} />
                  <YAxis dataKey="name" type="category" width={120} tick={<CustomAxisTick axis="y" />} />
                  <Tooltip 
                    formatter={(value: number) => `₹${value.toFixed(2)}`}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    cursor={false}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`url(#categoryGradient-${index})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle>Category Details</CardTitle>
              <CardDescription>Statistics for each category</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {expensesByCategory.map((category, index) => {
                  const categoryExpenses = expenses.filter((e) => e.category === category.name)
                  const percentage = (category.value / totalExpenses) * 100
                  const color = CHART_COLORS[index % CHART_COLORS.length]
                  return (
                    <div key={category.name} className="space-y-2 p-4 rounded-lg border border-border/60 bg-card/60 transition-colors hover:bg-accent/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-5 h-5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-semibold text-lg">{category.name}</span>
                        </div>
                        <span className="text-sm font-medium text-muted-foreground px-3 py-1 bg-secondary rounded-full">
                          {categoryExpenses.length} transactions
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 bg-secondary rounded-full h-3 mr-3 overflow-hidden shadow-inner">
                          <div
                            className="h-3 rounded-full transition-all duration-500 ease-out"
                            style={{
                              width: `${percentage}%`,
                              background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
                            }}
                          />
                        </div>
                        <span className="font-bold text-lg" style={{ color: color }}>₹{category.value.toFixed(2)}</span>
                      </div>
                      <p className="text-xs font-medium px-3 py-1.5 bg-primary/5 rounded-full inline-block" style={{ color: color }}>
                        {percentage.toFixed(1)}% of total expenses
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4">
          <Card className="overflow-hidden border border-border/70 bg-card/80" ref={memberSpendingRef}>
            <CardHeader>
              <CardTitle>Member Spending Radar</CardTitle>
              <CardDescription>Spending patterns by category for each member</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={memberRadarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis 
                    dataKey="category" 
                    tick={(props) => {
                      const { x, y, payload } = props
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={4}
                            textAnchor="middle"
                            fill="currentColor"
                            className="text-xs fill-foreground"
                          >
                            {payload.value}
                          </text>
                        </g>
                      )
                    }}
                  />
                  <PolarRadiusAxis 
                    tick={(props) => {
                      const { x, y, payload } = props
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={4}
                            textAnchor="middle"
                            fill="currentColor"
                            className="text-xs fill-foreground"
                          >
                            {payload.value}
                          </text>
                        </g>
                      )
                    }}
                  />
                  {members.map((member, index) => (
                    <Radar
                      key={member.id}
                      name={member.name}
                      dataKey={member.name}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                  ))}
                  <Tooltip 
                    formatter={(value: number) => `₹${value.toFixed(2)}`}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    cursor={false}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <CustomLegend members={members} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden border border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle>Net Balances</CardTitle>
                <CardDescription>Who is owed money and who owes</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={memberBalances} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="positiveBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16a34a" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="negativeBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.55} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="name" tick={<CustomAxisTick axis="x" />} />
                    <YAxis tick={<CustomAxisTick axis="y" />} />
                    <Tooltip 
                      formatter={(value: number) => `₹${value.toFixed(2)}`}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={false}
                    />
                    <Bar dataKey="balance" fill="url(#positiveBalance)" name="Net Balance" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                      {memberBalances.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.balance >= 0 ? 'url(#positiveBalance)' : 'url(#negativeBalance)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle>Member Statistics</CardTitle>
                <CardDescription>Detailed breakdown per member</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {memberBalances.map((member) => {
                    return (
                      <div key={member.name} className="space-y-2 p-4 border border-border/60 rounded-xl bg-card/60 transition-colors hover:bg-accent/20">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-6 h-6 rounded-full ring-1 ring-border/60"
                            style={{ backgroundColor: member.color }}
                          />
                          <span className="font-bold text-lg">{member.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                          <div className="bg-muted/30 p-3 rounded-lg border border-border/60">
                            <p className="text-muted-foreground text-xs font-medium">My Share</p>
                            <p className="font-bold text-foreground text-lg">₹{member.myShare.toFixed(2)}</p>
                          </div>
                          <div className="bg-muted/30 p-3 rounded-lg border border-border/60">
                            <p className="text-muted-foreground text-xs font-medium">Amount Paid</p>
                            <p className="font-bold text-foreground text-lg">₹{member.paid.toFixed(2)}</p>
                          </div>
                          <div className="bg-muted/30 p-3 rounded-lg border border-border/60">
                            <p className="text-muted-foreground text-xs font-medium">Should Receive</p>
                            <p className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">₹{member.shouldReceive.toFixed(2)}</p>
                          </div>
                          <div className="bg-muted/30 p-3 rounded-lg border border-border/60">
                            <p className="text-muted-foreground text-xs font-medium">Ledger</p>
                            <p className="font-bold text-rose-600 dark:text-rose-400 text-lg">₹{member.iOweAbs.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default AnalyticsTab
