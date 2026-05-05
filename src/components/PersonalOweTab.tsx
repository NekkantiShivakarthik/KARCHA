import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import MemberAvatar from '@/components/MemberAvatar'
import { ArrowUpRight, Receipt, UserCircle } from '@phosphor-icons/react'
import { activityService, expenseService, profileService, type Expense, type Member } from '@/lib/supabase-service'
import { getISTTimestamp } from '@/lib/utils'

interface PersonalOweTabProps {
  currentUserId?: string | null
  onRefreshWorkspace?: () => Promise<void> | void
}

interface Settlement {
  from: string
  to: string
  amount: number
}

interface LedgerEntry {
  userId: string
  name: string
  amount: number
  avatarUrl?: string | null
  direction: 'receivable' | 'payable'
}

const palette = ['#6366f1', '#14b8a6', '#a855f7', '#f59e0b', '#ec4899', '#3b82f6']

const colorFor = (input: string): string => {
  const hash = input.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return palette[Math.abs(hash) % palette.length]
}

const formatDate = (value?: string) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const roundToTwo = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const calculateBalances = (expenses: Expense[]): Record<string, number> => {
  const balances: Record<string, number> = {}

  const ensureBalance = (userId: string) => {
    if (!(userId in balances)) {
      balances[userId] = 0
    }
  }

  for (const expense of expenses) {
    ensureBalance(expense.paidBy)
    Object.keys(expense.splits || {}).forEach(ensureBalance)

    if (expense.splitType === 'transfer') {
      const transferAmount = Object.values(expense.splits || {}).reduce((sum, value) => sum + value, 0) || expense.amount
      balances[expense.paidBy] += transferAmount
      Object.entries(expense.splits || {}).forEach(([memberId, amount]) => {
        balances[memberId] -= amount
      })
      continue
    }

    balances[expense.paidBy] += expense.amount
    Object.entries(expense.splits || {}).forEach(([memberId, amount]) => {
      balances[memberId] -= amount
    })
  }

  return balances
}

const calculateSettlements = (balances: Record<string, number>): Settlement[] => {
  const settlements: Settlement[] = []
  const debtors = Object.entries(balances)
    .filter(([, balance]) => balance < -0.01)
    .sort((a, b) => a[1] - b[1])
  const creditors = Object.entries(balances)
    .filter(([, balance]) => balance > 0.01)
    .sort((a, b) => b[1] - a[1])

  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const [debtorId, debtorBalance] = debtors[i]
    const [creditorId, creditorBalance] = creditors[j]
    const amount = Math.min(-debtorBalance, creditorBalance)

    settlements.push({
      from: debtorId,
      to: creditorId,
      amount: Number(amount.toFixed(2)),
    })

    debtors[i] = [debtorId, debtorBalance + amount]
    creditors[j] = [creditorId, creditorBalance - amount]

    if (Math.abs(debtors[i][1]) < 0.01) i += 1
    if (Math.abs(creditors[j][1]) < 0.01) j += 1
  }

  return settlements
}

export default function PersonalOweTab({ currentUserId, onRefreshWorkspace }: PersonalOweTabProps) {
  const [loading, setLoading] = useState(false)
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [allExpenses, setAllExpenses] = useState<Expense[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [showDirectExpenseDialog, setShowDirectExpenseDialog] = useState(false)
  const [directExpenseAmount, setDirectExpenseAmount] = useState('')
  const [directExpenseDescription, setDirectExpenseDescription] = useState('')
  const [directExpenseDirection, setDirectExpenseDirection] = useState<'you_paid' | 'they_paid'>('you_paid')
  const [showBillSplitterDialog, setShowBillSplitterDialog] = useState(false)
  const [splitBillAmount, setSplitBillAmount] = useState('')
  const [splitBillDescription, setSplitBillDescription] = useState('')
  const [splitBillPaidBy, setSplitBillPaidBy] = useState<'me' | 'them'>('me')
  const [splitBillMyShare, setSplitBillMyShare] = useState('')
  const [splitBillTheirShare, setSplitBillTheirShare] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!currentUserId) {
        setLedgerEntries([])
        setAllExpenses([])
        return
      }

      setLoading(true)
      try {
        const expenses = await expenseService.getAllAcrossWorkspaces()
        if (cancelled) return
        setAllExpenses(expenses)

        const balances = calculateBalances(expenses)
        const settlements = calculateSettlements(balances)
        const receivableSettlements = settlements.filter((settlement) => settlement.to === currentUserId && settlement.amount > 0)
        const payableSettlements = settlements.filter((settlement) => settlement.from === currentUserId && settlement.amount > 0)
        const counterpartyIds = [
          ...receivableSettlements.map((settlement) => settlement.from),
          ...payableSettlements.map((settlement) => settlement.to),
        ]

        if (!counterpartyIds.length) {
          setLedgerEntries([])
          return
        }

        const profilesById = await profileService.getProfilesByUserIds([...new Set(counterpartyIds)])
        if (cancelled) return

        const entries = [
          ...receivableSettlements.map((settlement) => {
            const profile = profilesById[settlement.from]
            return {
              userId: settlement.from,
              name: profile?.displayName || `User ${settlement.from.slice(0, 6)}`,
              avatarUrl: profile?.avatarUrl,
              amount: settlement.amount,
              direction: 'receivable' as const,
            }
          }),
          ...payableSettlements.map((settlement) => {
            const profile = profilesById[settlement.to]
            return {
              userId: settlement.to,
              name: profile?.displayName || `User ${settlement.to.slice(0, 6)}`,
              avatarUrl: profile?.avatarUrl,
              amount: settlement.amount,
              direction: 'payable' as const,
            }
          }),
        ].sort((a, b) => {
          if (a.direction !== b.direction) {
            return a.direction === 'receivable' ? -1 : 1
          }
          return b.amount - a.amount
        })

        setLedgerEntries(entries)
      } catch (error) {
        console.error('Failed to load ledger data:', error)
        if (!cancelled) {
          setLedgerEntries([])
          setAllExpenses([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [currentUserId])

  const receivableEntries = useMemo(
    () => ledgerEntries.filter((entry) => entry.direction === 'receivable'),
    [ledgerEntries],
  )

  const payableEntries = useMemo(
    () => ledgerEntries.filter((entry) => entry.direction === 'payable'),
    [ledgerEntries],
  )

  const totalReceivable = useMemo(
    () => receivableEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [receivableEntries],
  )

  const totalPayable = useMemo(
    () => payableEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [payableEntries],
  )

  const netPosition = totalReceivable - totalPayable

  const selectedEntry = useMemo(
    () => ledgerEntries.find((entry) => entry.userId === selectedUserId) || null,
    [ledgerEntries, selectedUserId],
  )

  const selectedMember = useMemo<Member | null>(() => {
    if (!selectedEntry) return null
    return {
      id: selectedEntry.userId,
      name: selectedEntry.name,
      avatarUrl: selectedEntry.avatarUrl || undefined,
      color: colorFor(selectedEntry.userId),
      role: 'member',
    }
  }, [selectedEntry])

  const selectedProfileStats = useMemo(() => {
    if (!currentUserId || !selectedEntry) return null

    const sharedExpenses = allExpenses
      .filter((expense) => {
        const myShare = Number(expense.splits?.[currentUserId] || 0)
        const friendShare = Number(expense.splits?.[selectedEntry.userId] || 0)
        return myShare > 0 || friendShare > 0 || expense.paidBy === currentUserId || expense.paidBy === selectedEntry.userId
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const amountYouOwe = sharedExpenses.reduce((sum, expense) => {
      if (expense.paidBy !== selectedEntry.userId) return sum
      return sum + Number(expense.splits?.[currentUserId] || 0)
    }, 0)

    const amountYouReceive = sharedExpenses.reduce((sum, expense) => {
      if (expense.paidBy !== currentUserId) return sum
      return sum + Number(expense.splits?.[selectedEntry.userId] || 0)
    }, 0)

    return {
      sharedExpenses: sharedExpenses.slice(0, 8),
      sharedCount: sharedExpenses.length,
      amountYouReceive,
      amountYouOwe,
      netBetweenYouTwo: amountYouReceive - amountYouOwe,
    }
  }, [allExpenses, currentUserId, selectedEntry])

  useEffect(() => {
    if (!selectedEntry) {
      setShowDirectExpenseDialog(false)
      setShowBillSplitterDialog(false)
      return
    }

    setDirectExpenseAmount('')
    setDirectExpenseDescription('')
    setDirectExpenseDirection(selectedEntry.direction === 'receivable' ? 'you_paid' : 'they_paid')
    setSplitBillAmount('')
    setSplitBillDescription('')
    setSplitBillPaidBy('me')
    setSplitBillMyShare('')
    setSplitBillTheirShare('')
  }, [selectedEntry])

  const handleDirectExpenseSubmit = async () => {
    if (!currentUserId || !selectedEntry) return

    const amount = Number.parseFloat(directExpenseAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return
    }

    const description = directExpenseDescription.trim()
    if (!description) {
      return
    }

    const otherUserId = selectedEntry.userId
    const paidBy = directExpenseDirection === 'you_paid' ? currentUserId : otherUserId
    const counterpartyId = directExpenseDirection === 'you_paid' ? otherUserId : currentUserId

    try {
      const created = await expenseService.create({
        description,
        amount,
        paidBy,
        splitType: 'transfer',
        splits: { [counterpartyId]: amount },
        date: getISTTimestamp(),
        addedBy: currentUserId,
        attachments: [],
        category: 'Transfer',
      })

      if (!created) {
        return
      }

      await activityService.create({
        type: 'expense_added',
        description: `Added direct expense with ${selectedEntry.name}: ${description}`,
        user: currentUserId,
        timestamp: getISTTimestamp(),
        details: `₹${amount.toFixed(2)}`,
      })

      await onRefreshWorkspace?.()
      setShowDirectExpenseDialog(false)
      setDirectExpenseAmount('')
      setDirectExpenseDescription('')
    } catch (error) {
      console.error('Failed to create direct expense:', error)
    }
  }

  const handleSplitBillSubmit = async () => {
    if (!currentUserId || !selectedEntry) return

    const amount = Number.parseFloat(splitBillAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return
    }

    const description = splitBillDescription.trim()
    if (!description) {
      return
    }

    const myShareValue = splitBillMyShare.trim()
      ? Number.parseFloat(splitBillMyShare)
      : roundToTwo(amount / 2)
    const theirShareValue = splitBillTheirShare.trim()
      ? Number.parseFloat(splitBillTheirShare)
      : roundToTwo(amount - myShareValue)

    if (!Number.isFinite(myShareValue) || !Number.isFinite(theirShareValue) || myShareValue < 0 || theirShareValue < 0) {
      return
    }

    if (Math.abs((myShareValue + theirShareValue) - amount) > 0.01) {
      return
    }

    const counterpartyId = selectedEntry.userId
    const paidBy = splitBillPaidBy === 'me' ? currentUserId : counterpartyId

    try {
      const created = await expenseService.create({
        description,
        amount,
        paidBy,
        splitType: 'exact',
        splits: {
          [currentUserId]: myShareValue,
          [counterpartyId]: theirShareValue,
        },
        date: getISTTimestamp(),
        addedBy: currentUserId,
        attachments: [],
        category: 'Other',
      })

      if (!created) {
        return
      }

      await activityService.create({
        type: 'expense_added',
        description: `Split bill with ${selectedEntry.name}: ${description}`,
        user: currentUserId,
        timestamp: getISTTimestamp(),
        details: `₹${amount.toFixed(2)}`,
      })

      await onRefreshWorkspace?.()
      setShowBillSplitterDialog(false)
      setSplitBillAmount('')
      setSplitBillDescription('')
      setSplitBillMyShare('')
      setSplitBillTheirShare('')
    } catch (error) {
      console.error('Failed to create split bill:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Ledger</h2>
        <p className="text-sm text-muted-foreground">
          Track who will pay you and who you need to pay across all your workspaces.
        </p>
      </div>

      <Card className="p-4 sm:p-5 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 border-primary/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-4 sm:grid-cols-3 w-full">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total You Will Receive</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">₹{totalReceivable.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total You Owe</p>
              <p className="mt-2 text-3xl font-bold text-destructive tabular-nums">₹{totalPayable.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Net Position</p>
              <p className={`mt-2 text-3xl font-bold tabular-nums ${netPosition > 0 ? 'text-emerald-600 dark:text-emerald-400' : netPosition < 0 ? 'text-destructive' : 'text-foreground'}`}>
                ₹{Math.abs(netPosition).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-5 text-sm text-muted-foreground">Loading settlements...</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">You will receive from</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">People who owe you</h3>
              </div>
              <Badge variant="outline" className="text-xs">
                {receivableEntries.length} {receivableEntries.length === 1 ? 'person' : 'people'}
              </Badge>
            </div>

            {receivableEntries.length ? (
              <div className="space-y-2">
                {receivableEntries.map((entry) => (
                  <button
                    key={`receivable-${entry.userId}`}
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedUserId(entry.userId)}
                  >
                    <Card className="p-4 transition-colors hover:bg-accent/30">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <MemberAvatar
                            member={{
                              id: entry.userId,
                              name: entry.name,
                              avatarUrl: entry.avatarUrl || undefined,
                              color: colorFor(entry.userId),
                              role: 'member',
                            }}
                            size="sm"
                            className="h-9 w-9"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
                            <p className="truncate text-xs text-muted-foreground">Will receive from this person</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">₹{entry.amount.toFixed(2)}</p>
                          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            View ledger <ArrowUpRight className="h-3.5 w-3.5" />
                          </p>
                        </div>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            ) : (
              <Card className="p-5 text-sm text-muted-foreground">
                Nobody owes you right now.
              </Card>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">You owe to</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">People you need to pay</h3>
              </div>
              <Badge variant="outline" className="text-xs">
                {payableEntries.length} {payableEntries.length === 1 ? 'person' : 'people'}
              </Badge>
            </div>

            {payableEntries.length ? (
              <div className="space-y-2">
                {payableEntries.map((entry) => (
                  <button
                    key={`payable-${entry.userId}`}
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedUserId(entry.userId)}
                  >
                    <Card className="p-4 transition-colors hover:bg-accent/30">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <MemberAvatar
                            member={{
                              id: entry.userId,
                              name: entry.name,
                              avatarUrl: entry.avatarUrl || undefined,
                              color: colorFor(entry.userId),
                              role: 'member',
                            }}
                            size="sm"
                            className="h-9 w-9"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
                            <p className="truncate text-xs text-muted-foreground">You need to pay this person</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-destructive tabular-nums">₹{entry.amount.toFixed(2)}</p>
                          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            View ledger <ArrowUpRight className="h-3.5 w-3.5" />
                          </p>
                        </div>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            ) : (
              <Card className="p-5 text-sm text-muted-foreground">
                You do not owe anyone right now.
              </Card>
            )}
          </Card>
        </div>
      )}

      <Dialog open={Boolean(selectedEntry)} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <DialogContent className="sm:max-w-[640px]">
          {selectedEntry && selectedMember && selectedProfileStats && (
            <>
              <DialogHeader>
                <DialogTitle>Ledger details</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <Card className="p-4 border-border/70 bg-gradient-to-br from-card to-accent/20">
                  <div className="flex items-center gap-3">
                    <MemberAvatar member={selectedMember} size="lg" className="h-14 w-14" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold">{selectedEntry.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{selectedEntry.userId}</p>
                    </div>
                    <Badge variant="outline" className="inline-flex items-center gap-1">
                      <UserCircle className="h-3.5 w-3.5" /> {selectedEntry.direction === 'receivable' ? 'Will receive' : 'Will pay'}
                    </Badge>
                  </div>
                </Card>

                <div className="flex justify-end">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setShowDirectExpenseDialog(true)}>
                      Add direct expense
                    </Button>
                    <Button type="button" onClick={() => setShowBillSplitterDialog(true)}>
                      Split bill
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <Card className="p-3 border-border/70">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {selectedEntry.direction === 'receivable' ? 'You will receive' : 'You owe'}
                    </p>
                    <p className={`mt-1 text-lg font-semibold ${selectedEntry.direction === 'receivable' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                      ₹{selectedEntry.amount.toFixed(2)}
                    </p>
                  </Card>
                  <Card className="p-3 border-border/70">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared expenses</p>
                    <p className="mt-1 text-lg font-semibold">{selectedProfileStats.sharedCount}</p>
                  </Card>
                  <Card className="p-3 border-border/70">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Net between you</p>
                    <p className={`mt-1 text-lg font-semibold ${selectedProfileStats.netBetweenYouTwo > 0 ? 'text-emerald-600 dark:text-emerald-400' : selectedProfileStats.netBetweenYouTwo < 0 ? 'text-destructive' : ''}`}>
                      ₹{Math.abs(selectedProfileStats.netBetweenYouTwo).toFixed(2)} {selectedProfileStats.netBetweenYouTwo > 0 ? 'they owe you' : selectedProfileStats.netBetweenYouTwo < 0 ? 'you owe them' : 'settled'}
                    </p>
                  </Card>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Card className="p-3 border-border/70">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">You will receive from them</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">₹{selectedProfileStats.amountYouReceive.toFixed(2)}</p>
                  </Card>
                  <Card className="p-3 border-border/70">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">You owe them</p>
                    <p className="mt-1 text-lg font-semibold text-destructive">₹{selectedProfileStats.amountYouOwe.toFixed(2)}</p>
                  </Card>
                </div>

                <Card className="p-3 border-border/70">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">Recent shared expenses</p>
                    <Badge variant="secondary">Last {selectedProfileStats.sharedExpenses.length}</Badge>
                  </div>

                  {selectedProfileStats.sharedExpenses.length ? (
                    <ScrollArea className="max-h-64">
                      <div className="space-y-2 pr-2">
                        {selectedProfileStats.sharedExpenses.map((expense) => {
                          const yourShare = Number(expense.splits?.[currentUserId || ''] || 0)
                          const friendShare = Number(expense.splits?.[selectedEntry.userId] || 0)
                          return (
                            <div key={expense.id} className="rounded-md border border-border/60 bg-background/60 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{expense.description}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(expense.date)} · paid by {expense.paidBy === currentUserId ? 'you' : expense.paidBy === selectedEntry.userId ? selectedEntry.name : 'someone else'}
                                  </p>
                                </div>
                                <div className="text-right text-xs">
                                  <p className="font-medium">You: ₹{yourShare.toFixed(2)}</p>
                                  <p className="text-muted-foreground">{selectedEntry.name}: ₹{friendShare.toFixed(2)}</p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="rounded-md border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                      <p className="inline-flex items-center gap-2"><Receipt className="h-4 w-4" />No shared expenses found yet.</p>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDirectExpenseDialog} onOpenChange={setShowDirectExpenseDialog}>
        <DialogContent className="sm:max-w-[520px]">
          {selectedEntry && (
            <>
              <DialogHeader>
                <DialogTitle>Direct expense</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">Between you and {selectedEntry.name}</p>
                  <p className="text-xs text-muted-foreground">Record a direct expense or settlement without using a group split.</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setDirectExpenseDirection('you_paid')}
                    className={`rounded-xl border p-4 text-left transition-colors ${directExpenseDirection === 'you_paid' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/30'}`}
                  >
                    <p className="text-sm font-semibold text-foreground">I paid for them</p>
                    <p className="text-xs text-muted-foreground">They owe you this amount</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectExpenseDirection('they_paid')}
                    className={`rounded-xl border p-4 text-left transition-colors ${directExpenseDirection === 'they_paid' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/30'}`}
                  >
                    <p className="text-sm font-semibold text-foreground">They paid for me</p>
                    <p className="text-xs text-muted-foreground">You owe them this amount</p>
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="direct-expense-description">
                    Description
                  </label>
                  <Input
                    id="direct-expense-description"
                    value={directExpenseDescription}
                    onChange={(event) => setDirectExpenseDescription(event.target.value)}
                    placeholder="e.g. Coffee, lunch, taxi"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="direct-expense-amount">
                    Amount
                  </label>
                  <Input
                    id="direct-expense-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={directExpenseAmount}
                    onChange={(event) => setDirectExpenseAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowDirectExpenseDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleDirectExpenseSubmit}>
                    Save direct expense
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showBillSplitterDialog} onOpenChange={setShowBillSplitterDialog}>
        <DialogContent className="sm:max-w-[560px]">
          {selectedEntry && (
            <>
              <DialogHeader>
                <DialogTitle>Split bill</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">Split a bill between you and {selectedEntry.name}</p>
                  <p className="text-xs text-muted-foreground">Record both shares so the ledger shows who owes what.</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSplitBillPaidBy('me')}
                    className={`rounded-xl border p-4 text-left transition-colors ${splitBillPaidBy === 'me' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/30'}`}
                  >
                    <p className="text-sm font-semibold text-foreground">I paid the bill</p>
                    <p className="text-xs text-muted-foreground">You are fronting the total amount</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitBillPaidBy('them')}
                    className={`rounded-xl border p-4 text-left transition-colors ${splitBillPaidBy === 'them' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/30'}`}
                  >
                    <p className="text-sm font-semibold text-foreground">They paid the bill</p>
                    <p className="text-xs text-muted-foreground">Your friend covered the total amount</p>
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Description</p>
                  <Input
                    value={splitBillDescription}
                    onChange={(event) => setSplitBillDescription(event.target.value)}
                    placeholder="e.g. Dinner, cab, groceries"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Total bill amount</p>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={splitBillAmount}
                    onChange={(event) => setSplitBillAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">My share</p>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={splitBillMyShare}
                      onChange={(event) => setSplitBillMyShare(event.target.value)}
                      placeholder="Auto 50%"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{selectedEntry.name}&apos;s share</p>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={splitBillTheirShare}
                      onChange={(event) => setSplitBillTheirShare(event.target.value)}
                      placeholder="Auto 50%"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">Preview</p>
                  <p className="mt-1">Total: ₹{Number.parseFloat(splitBillAmount || '0').toFixed(2)}</p>
                  <p>My share: ₹{(splitBillMyShare ? Number.parseFloat(splitBillMyShare) : Number.parseFloat(splitBillAmount || '0') / 2 || 0).toFixed(2)}</p>
                  <p>{selectedEntry.name}&apos;s share: ₹{(splitBillTheirShare ? Number.parseFloat(splitBillTheirShare) : (Number.parseFloat(splitBillAmount || '0') / 2 || 0)).toFixed(2)}</p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowBillSplitterDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSplitBillSubmit}>
                    Save split bill
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
