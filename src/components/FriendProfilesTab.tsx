import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import MemberAvatar from '@/components/MemberAvatar'
import { ArrowSquareOut, Clock, CurrencyCircleDollar, TrendDown, TrendUp, Users } from '@phosphor-icons/react'
import type { Activity, Expense, Member } from '@/lib/supabase-service'

type FriendProfilesTabProps = {
  members: Member[]
  expenses: Expense[]
  activities: Activity[]
  currentUserId: string | null
}

type MemberProfileStats = {
  member: Member
  totalPaid: number
  totalShare: number
  netBalance: number
  expenseCount: number
  lastActivityLabel: string
  topCategories: Array<{ category: string; amount: number }>
  recentExpenses: Expense[]
}

const currency = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatCurrency = (value: number) => `₹${currency.format(Number.isFinite(value) ? value : 0)}`

const formatDateTime = (value?: string) => {
  if (!value) return 'No recent activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No recent activity'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function FriendProfilesTab({ members, expenses, activities, currentUserId }: FriendProfilesTabProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const memberStats = useMemo<MemberProfileStats[]>(() => {
    return members.map((member) => {
      const relatedExpenses = expenses
        .filter((expense) => expense.paidBy === member.id || Number(expense.splits?.[member.id] || 0) > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      const totalPaid = relatedExpenses
        .filter((expense) => expense.paidBy === member.id)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)

      const totalShare = relatedExpenses.reduce((sum, expense) => sum + Number(expense.splits?.[member.id] || 0), 0)
      const netBalance = totalPaid - totalShare

      const categoryMap = new Map<string, number>()
      for (const expense of relatedExpenses) {
        const key = expense.category || 'Other'
        const contribution = Number(expense.splits?.[member.id] || 0)
        if (contribution <= 0) continue
        categoryMap.set(key, (categoryMap.get(key) || 0) + contribution)
      }

      const topCategories = Array.from(categoryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category, amount]) => ({ category, amount }))

      const memberActivity = activities.find((activity) => activity.user === member.name)
      const recentExpenseTimestamp = relatedExpenses[0]?.date
      const lastActivityLabel = formatDateTime(memberActivity?.timestamp || recentExpenseTimestamp)

      return {
        member,
        totalPaid,
        totalShare,
        netBalance,
        expenseCount: relatedExpenses.length,
        lastActivityLabel,
        topCategories,
        recentExpenses: relatedExpenses.slice(0, 5),
      }
    })
  }, [members, expenses, activities])

  const selected = memberStats.find((item) => item.member.id === selectedMemberId) || null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Member Profiles</h3>
          <p className="text-sm text-muted-foreground">See each friend’s contribution, balance, and recent activity in this workspace.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{members.length} members</Badge>
      </div>

      {memberStats.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No members found in this workspace yet.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {memberStats.map((profile) => (
            <Card key={profile.member.id} className="p-4 border-border/70 bg-card/85">
              <div className="flex items-center gap-3">
                <MemberAvatar member={profile.member} size="lg" className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{profile.member.name}</p>
                    {profile.member.id === currentUserId && <Badge variant="outline">You</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{profile.member.role || 'member'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelectedMemberId(profile.member.id)}>
                  View
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-border/60 bg-background/60 p-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</p>
                  <p className="mt-1 font-semibold">{formatCurrency(profile.totalPaid)}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/60 p-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Share</p>
                  <p className="mt-1 font-semibold">{formatCurrency(profile.totalShare)}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/60 p-2 col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net Position</p>
                  <p className={`mt-1 flex items-center gap-1 font-semibold ${profile.netBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {profile.netBalance >= 0 ? <TrendUp className="h-4 w-4" /> : <TrendDown className="h-4 w-4" />}
                    {formatCurrency(Math.abs(profile.netBalance))} {profile.netBalance >= 0 ? 'to receive' : 'to pay'}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {profile.expenseCount} expenses</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {profile.lastActivityLabel}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedMemberId(null)}>
        <DialogContent className="sm:max-w-[640px]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Profile: {selected.member.name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/70 p-3">
                  <MemberAvatar member={selected.member} size="lg" className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold">{selected.member.name}</p>
                    <p className="text-xs text-muted-foreground">Member ID: {selected.member.id}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">{selected.member.role || 'member'}</Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <Card className="p-3 border-border/70">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Paid</p>
                    <p className="mt-1 text-base font-semibold">{formatCurrency(selected.totalPaid)}</p>
                  </Card>
                  <Card className="p-3 border-border/70">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Share</p>
                    <p className="mt-1 text-base font-semibold">{formatCurrency(selected.totalShare)}</p>
                  </Card>
                  <Card className="p-3 border-border/70">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Net</p>
                    <p className={`mt-1 flex items-center gap-1 text-base font-semibold ${selected.netBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      <CurrencyCircleDollar className="h-4 w-4" />
                      {selected.netBalance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(selected.netBalance))}
                    </p>
                  </Card>
                </div>

                <Card className="p-3 border-border/70">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">Top categories</p>
                    <Badge variant="secondary">By member share</Badge>
                  </div>
                  {selected.topCategories.length ? (
                    <div className="space-y-2">
                      {selected.topCategories.map((item) => (
                        <div key={item.category} className="flex items-center justify-between rounded-md bg-background/70 px-2.5 py-2">
                          <span className="text-sm">{item.category}</span>
                          <span className="text-sm font-semibold">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No categorized spend data available yet.</p>
                  )}
                </Card>

                <Card className="p-3 border-border/70">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">Recent expenses</p>
                    <Badge variant="outline">Last 5</Badge>
                  </div>
                  {selected.recentExpenses.length ? (
                    <ScrollArea className="max-h-56">
                      <div className="space-y-2 pr-2">
                        {selected.recentExpenses.map((expense) => (
                          <div key={expense.id} className="rounded-md border border-border/60 bg-background/60 p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{expense.description}</p>
                                <p className="text-xs text-muted-foreground">{new Date(expense.date).toLocaleDateString()} · {expense.category}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold">{formatCurrency(Number(expense.splits?.[selected.member.id] || 0))}</p>
                                <p className="text-[11px] text-muted-foreground">member share</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground">No expenses linked to this member yet.</p>
                  )}
                </Card>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setSelectedMemberId(null)}>
                    Close
                    <ArrowSquareOut className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
