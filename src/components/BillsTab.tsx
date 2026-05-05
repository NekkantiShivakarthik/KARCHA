import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import AddExpenseDialogModern from '@/components/AddExpenseDialogModern'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Receipt, PencilSimple, Trash, Image as ImageIcon, CaretDown, MagnifyingGlass, Sliders, ArrowsClockwise, Check, ArrowRight, User } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import RecordSettlementDialog from '@/components/RecordSettlementDialog'
import ImageViewer from '@/components/ImageViewer'
import MemberAvatar from '@/components/MemberAvatar'
import { toast } from 'sonner'
import { deleteImages } from '@/lib/image-storage'
import { expenseService, activityService, type Member, type Expense, type Activity } from '@/lib/supabase-service'
import { getISTTimestamp, formatToIST } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface BillsTabProps {
  expenses: Expense[]
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>
  activities: Activity[]
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>
  members: Member[]
  currentUserId?: string | null
  isPersonalWorkspace?: boolean
}

export default function BillsTab({
  expenses,
  setExpenses,
  activities,
  setActivities,
  members,
  currentUserId,
  isPersonalWorkspace = false,
}: BillsTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showSettlementDialog, setShowSettlementDialog] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null)
  const [viewerImages, setViewerImages] = useState<string[]>([])
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [expandedExpenses, setExpandedExpenses] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set())
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [crossWorkspaceExpenses, setCrossWorkspaceExpenses] = useState<Expense[]>([])
  const [crossWorkspaceLoading, setCrossWorkspaceLoading] = useState(false)

  const balances = calculateBalances(expenses || [], members)
  const settlements = useMemo(() => calculateSettlements(balances), [balances])

  // Filter and search expenses
  const filteredExpenses = (expenses || []).filter((expense) => {
    const matchesSearch = !searchQuery || 
      expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.category.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = !selectedCategory || expense.category === selectedCategory
    const matchesMember = isPersonalWorkspace || !selectedMember || expense.paidBy === selectedMember
    
    return matchesSearch && matchesCategory && matchesMember
  })

  const categories = Array.from(new Set((expenses || []).map(e => e.category))).sort()
  const visibleExpenseIds = filteredExpenses.map(expense => expense.id)
  const allVisibleSelected = visibleExpenseIds.length > 0 && visibleExpenseIds.every(id => selectedExpenses.has(id))
  const someVisibleSelected = visibleExpenseIds.some(id => selectedExpenses.has(id))

  useEffect(() => {
    setSelectedExpenses((current) => {
      if (!current.size) return current
      const existingIds = new Set((expenses || []).map(expense => expense.id))
      const next = new Set(Array.from(current).filter(id => existingIds.has(id)))
      return next
    })
  }, [expenses])

  useEffect(() => {
    let cancelled = false

    const loadCrossWorkspaceExpenses = async () => {
      if (!isPersonalWorkspace || !currentUserId) {
        if (!cancelled) {
          setCrossWorkspaceExpenses([])
          setCrossWorkspaceLoading(false)
        }
        return
      }

      setCrossWorkspaceLoading(true)
      try {
        const allWorkspaceExpenses = await expenseService.getAllAcrossWorkspaces()
        if (!cancelled) {
          setCrossWorkspaceExpenses(allWorkspaceExpenses)
        }
      } catch (error) {
        console.error('Failed to load cross-workspace expenses:', error)
      } finally {
        if (!cancelled) {
          setCrossWorkspaceLoading(false)
        }
      }
    }

    loadCrossWorkspaceExpenses()

    return () => {
      cancelled = true
    }
  }, [isPersonalWorkspace, currentUserId, expenses])

  const analyticsSourceExpenses = useMemo(() => (
    isPersonalWorkspace ? crossWorkspaceExpenses : (expenses || [])
  ), [isPersonalWorkspace, crossWorkspaceExpenses, expenses])

  const dashboardStats = useMemo(() => {
    const today = new Date()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()

    let myTransactionCount = 0
    let monthTotal = 0
    let myNetBalance = 0

    for (const expense of analyticsSourceExpenses) {
      const amount = Number(expense.amount) || 0

      if (expense.splitType === 'transfer') {
        const transferAmount = Object.values(expense.splits || {}).reduce((sum, value) => sum + value, 0) || amount

        if (currentUserId && expense.paidBy === currentUserId) {
          myNetBalance += transferAmount
        }

        if (currentUserId) {
          myNetBalance -= Number(expense.splits?.[currentUserId] || 0)
        }

        continue
      }

      if (currentUserId && expense.paidBy === currentUserId) {
        myTransactionCount += 1

        const expenseDate = new Date(expense.date)
        if (!Number.isNaN(expenseDate.getTime()) && expenseDate.getFullYear() === currentYear && expenseDate.getMonth() === currentMonth) {
          monthTotal += amount
        }

        myNetBalance += amount
      }

      if (currentUserId) {
        myNetBalance -= Number(expense.splits?.[currentUserId] || 0)
      }
    }

    const youReceive = Math.max(0, myNetBalance)
    const youOwe = Math.max(0, -myNetBalance)

    return {
      monthTotal,
      myTransactionCount,
      youOwe,
      youReceive,
    }
  }, [analyticsSourceExpenses, currentUserId])

  const handleAddExpense = async (expense: Expense) => {
    try {
      if (editingExpense) {
        // Update existing expense in Supabase
        const updated = await expenseService.update(editingExpense.id, expense)
        if (updated) {
          setExpenses((current: Expense[]) =>
            (current || []).map((item: Expense) => item.id === editingExpense.id ? updated : item)
          )
          
          // Log activity
          await activityService.create({
            type: 'expense_edited',
            description: `Updated expense: ${expense.description}`,
            user: expense.addedBy,
            timestamp: getISTTimestamp(),
            details: `₹${expense.amount.toFixed(2)}`,
          })
          setActivities((current) => [
            {
              id: Date.now().toString(),
              type: 'expense_edited',
              description: `Updated expense: ${expense.description}`,
              user: expense.addedBy,
              timestamp: getISTTimestamp(),
              details: `₹${expense.amount.toFixed(2)}`,
            },
            ...(current || []),
          ])
          toast.success('Expense updated successfully')
        } else {
          toast.error('Failed to update expense')
        }
      } else {
        // Create new expense in Supabase
        const created = await expenseService.create(expense)
        if (created) {
          setExpenses((current) => [...(current || []), created])
          
          // Log activity
          await activityService.create({
            type: 'expense_added',
            description: `Added expense: ${expense.description}`,
            user: expense.addedBy,
            timestamp: getISTTimestamp(),
            details: `₹${expense.amount.toFixed(2)}`,
          })
          setActivities((current) => [
            {
              id: Date.now().toString(),
              type: 'expense_added',
              description: `Added expense: ${expense.description}`,
              user: expense.addedBy,
              timestamp: getISTTimestamp(),
              details: `₹${expense.amount.toFixed(2)}`,
            },
            ...(current || []),
          ])
          toast.success('Expense added successfully')
        } else {
          toast.error('Failed to add expense')
        }
      }
    } catch (error) {
      console.error('Error saving expense:', error)
      toast.error('Failed to save expense')
    }
    setEditingExpense(null)
  }

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense)
    setShowAddDialog(true)
  }

  const handleDelete = async (expense: Expense) => {
    try {
      if (expense.attachments && expense.attachments.length > 0) {
        await deleteImages(expense.attachments)
      }
      
      const deleted = await expenseService.delete(expense.id)
      if (deleted) {
        setExpenses((current) => (current || []).filter(item => item.id !== expense.id))
        
        // Log activity
        await activityService.create({
          type: 'expense_deleted',
          description: `Deleted expense: ${expense.description}`,
          user: expense.addedBy,
          timestamp: getISTTimestamp(),
          details: `₹${expense.amount.toFixed(2)}`,
        })
        setActivities((current) => [
          {
            id: Date.now().toString(),
            type: 'expense_deleted',
            description: `Deleted expense: ${expense.description}`,
            user: expense.addedBy,
            timestamp: getISTTimestamp(),
            details: `₹${expense.amount.toFixed(2)}`,
          },
          ...(current || []),
        ])
        toast.success('Expense deleted successfully')
      } else {
        toast.error('Failed to delete expense')
      }
    } catch (error) {
      console.error('Error deleting expense:', error)
      toast.error('Failed to delete expense')
    }
  }

  const toggleSelectExpense = (expenseId: string) => {
    setSelectedExpenses((current) => {
      const next = new Set(current)
      if (next.has(expenseId)) {
        next.delete(expenseId)
      } else {
        next.add(expenseId)
      }
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelectedExpenses((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleExpenseIds.forEach(id => next.delete(id))
      } else {
        visibleExpenseIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedExpenses)
    if (!ids.length) {
      setShowBulkDeleteDialog(false)
      return
    }

    for (const id of ids) {
      const expense = expenses?.find(exp => exp.id === id)
      if (expense) {
        await handleDelete(expense)
      }
    }

    setSelectedExpenses(new Set())
    setShowBulkDeleteDialog(false)
  }

  const toggleExpenseExpanded = (expenseId: string) => {
    setExpandedExpenses((current) => {
      const newSet = new Set(current)
      if (newSet.has(expenseId)) {
        newSet.delete(expenseId)
      } else {
        newSet.add(expenseId)
      }
      return newSet
    })
  }

  return (
    <>
      {isPersonalWorkspace ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4 sm:p-5 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 border-primary/20">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This Month (All Workspaces)</p>
            <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">₹{dashboardStats.monthTotal.toFixed(2)}</p>
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transactions</p>
            <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">{dashboardStats.myTransactionCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {crossWorkspaceLoading ? 'Updating from all workspaces...' : 'Includes your spending from all workspaces'}
            </p>
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">How Much I Owe</p>
            <p className="mt-2 text-2xl font-bold text-destructive tabular-nums">₹{dashboardStats.youOwe.toFixed(2)}</p>
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Yet to Receive</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600 tabular-nums">₹{dashboardStats.youReceive.toFixed(2)}</p>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="p-4 sm:p-5 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 border-primary/20 lg:col-span-3">
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3">Balance Summary</h2>

            {settlements.length === 0 ? (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                <Check className="h-5 w-5" weight="bold" />
                <span className="font-medium">All settled up!</span>
              </div>
            ) : (
              <div className="space-y-2">
                {settlements.map((settlement, idx) => {
                  const from = members.find((member) => member.id === settlement.from)
                  const to = members.find((member) => member.id === settlement.to)

                  return (
                    <motion.div
                      key={`${settlement.from}-${settlement.to}-${idx}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex items-center gap-2.5 bg-card rounded-lg p-3 shadow-sm border border-border/50"
                    >
                      <MemberAvatar member={from} size="sm" className="h-7 w-7" />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <MemberAvatar member={to} size="sm" className="h-7 w-7" />
                      <div className="flex-1 min-w-0 text-sm">
                        <span className="font-medium truncate">{from?.name.split(' ')[0] || 'Member'}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="font-medium truncate">{to?.name.split(' ')[0] || 'Member'}</span>
                      </div>
                      <Badge variant="secondary" className="font-semibold tabular-nums shrink-0">
                        ₹{settlement.amount.toFixed(0)}
                      </Badge>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </Card>

          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-muted-foreground" weight="bold" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Individual Share</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
              {members.map((member) => {
                let totalShare = 0

                ;(expenses || []).forEach((expense) => {
                  if (expense.splitType === 'transfer') return
                  totalShare += expense.splits?.[member.id] || 0
                })

                return (
                  <Card key={member.id} className="p-2.5 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-2 lg:flex-col lg:text-center">
                      <MemberAvatar member={member} size="sm" className="h-8 w-8" />
                      <div className="flex-1 min-w-0 lg:w-full">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        <p className="text-base font-bold text-foreground tabular-nums">₹{totalShare.toFixed(0)}</p>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Expenses</h2>
        <div className="flex items-center gap-2">
          {!isPersonalWorkspace && (
            <Button
              onClick={() => setShowSettlementDialog(true)}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <ArrowsClockwise className="h-4 w-4" weight="bold" />
              Record Settlement
            </Button>
          )}
          <Button 
            onClick={() => {
              setEditingExpense(null)
              setShowAddDialog(true)
            }} 
            size="sm" 
            className="gap-2"
          >
            <Plus className="h-4 w-4" weight="bold" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Sliders className="h-4 w-4" weight="bold" />
            <span className="hidden sm:inline">Filters</span>
          </Button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="grid gap-3 p-3 bg-card rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedCategory === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                >
                  All
                </Button>
                {categories.map((category) => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </div>

            {!isPersonalWorkspace && (
              <>
                <Separator />

                <div>
                  <p className="text-sm font-medium mb-2">Paid By</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={selectedMember === null ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedMember(null)}
                    >
                      All
                    </Button>
                    {members.map((member) => (
                      <Button
                        key={member.id}
                        variant={selectedMember === member.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedMember(member.id)}
                        className="gap-2"
                      >
                        <MemberAvatar member={member} size="sm" className="h-4 w-4" />
                        {member.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {filteredExpenses.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
              onCheckedChange={toggleSelectAllVisible}
            />
            <span>Select all</span>
            {selectedExpenses.size > 0 && (
              <span className="text-muted-foreground">({selectedExpenses.size} selected)</span>
            )}
          </div>
          {selectedExpenses.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="gap-2"
              onClick={() => setShowBulkDeleteDialog(true)}
            >
              <Trash className="h-4 w-4" />
              Delete selected
            </Button>
          )}
        </div>
      )}

      {(!filteredExpenses || filteredExpenses.length === 0) ? (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">{expenses && expenses.length > 0 ? 'No matching expenses' : 'No expenses yet'}</p>
            <p className="text-sm mt-1">{expenses && expenses.length > 0 ? 'Try adjusting your filters' : 'Add your first expense to start tracking'}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filteredExpenses.map((expense, idx) => {
              const payer = members.find(m => m.id === expense.paidBy)
              const addedBy = members.find(m => m.id === expense.addedBy)
              const isExpanded = expandedExpenses.has(expense.id)
              const canExpand = isPersonalWorkspace
                ? Boolean(expense.attachments?.length)
                : (expense.splitType !== 'equal' || Boolean(expense.attachments?.length) || (members && members.length > 1))
              return (
                <motion.div
                  key={expense.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card className="hover:shadow-md transition-shadow overflow-hidden">
                    <div className="p-3">
                      {/* Mobile Layout */}
                      <div className="flex flex-col gap-3 md:hidden">
                        {/* Header Row */}
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={selectedExpenses.has(expense.id)}
                            onCheckedChange={() => toggleSelectExpense(expense.id)}
                            className="mt-1"
                          />
                          <MemberAvatar member={payer} size="sm" className="flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-foreground break-words">
                              {expense.description}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {expense.category && (
                                <Badge variant="outline" className="text-xs">
                                  {expense.category}
                                </Badge>
                              )}
                              {expense.splitType === 'transfer' && (
                                <Badge variant="secondary" className="text-xs">
                                  Transfer
                                </Badge>
                              )}
                              {expense.attachments && expense.attachments.length > 0 && (
                                <Badge variant="secondary" className="text-xs gap-1">
                                  <ImageIcon className="h-3 w-3" />
                                  {expense.attachments.length}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Info Row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              {payer && <MemberAvatar member={payer} size="sm" className="h-4 w-4" />}
                              <span>{payer?.name.split(' ')[0]}</span>
                            </div>
                            <span>•</span>
                            <span>{formatToIST(expense.date).split(',')[0]}</span>
                          </div>
                          <p className="font-bold text-lg text-foreground tabular-nums whitespace-nowrap">
                            ₹{expense.amount.toFixed(2)}
                          </p>
                        </div>
                        
                        {/* Actions Row */}
                        <div className="flex items-center gap-1">
                          {canExpand && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleExpenseExpanded(expense.id)}
                              className="h-8 px-3 text-xs gap-1.5"
                            >
                              <span>Details</span>
                              <CaretDown 
                                className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                              />
                            </Button>
                          )}
                          <div className="flex-1"></div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(expense)}
                            className="h-8 w-8 p-0"
                          >
                            <PencilSimple className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteExpenseId(expense.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden md:flex items-center gap-3">
                        <Checkbox
                          checked={selectedExpenses.has(expense.id)}
                          onCheckedChange={() => toggleSelectExpense(expense.id)}
                        />
                        <MemberAvatar member={payer} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-semibold text-sm text-foreground truncate">
                              {expense.description}
                            </h3>
                            {expense.category && (
                              <Badge variant="outline" className="text-xs">
                                {expense.category}
                              </Badge>
                            )}
                            {expense.splitType === 'transfer' && (
                              <Badge variant="secondary" className="text-xs">
                                Transfer
                              </Badge>
                            )}
                            {expense.attachments && expense.attachments.length > 0 && (
                              <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                                <ImageIcon className="h-3 w-3" />
                                {expense.attachments.length}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              {payer && <MemberAvatar member={payer} size="sm" className="h-4 w-4" />}
                              <span>{payer?.name.split(' ')[0]}</span>
                            </div>
                            <span>•</span>
                            <span>{formatToIST(expense.date)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="font-bold text-base text-foreground tabular-nums">
                              ₹{expense.amount.toFixed(2)}
                            </p>
                          </div>
                          {canExpand && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleExpenseExpanded(expense.id)}
                              className="h-8 w-8 p-0"
                            >
                              <CaretDown 
                                className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                              />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(expense)}
                            className="h-8 w-8 p-0"
                          >
                            <PencilSimple className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteExpenseId(expense.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-2 border-t border-border">
                            <div className="mb-3 pb-3 border-b border-border">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-muted-foreground">Paid by:</p>
                                  {payer && (
                                    <div className="flex items-center gap-1">
                                      <MemberAvatar member={payer} size="sm" className="h-4 w-4" />
                                      <span className="text-xs font-medium">{payer.name}</span>
                                    </div>
                                  )}
                                </div>
                                {addedBy && (
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-semibold text-muted-foreground">Added by:</p>
                                    <div className="flex items-center gap-1">
                                      <MemberAvatar member={addedBy} size="sm" className="h-4 w-4" />
                                      <span className="text-xs font-medium">{addedBy.name}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {!isPersonalWorkspace && (
                              <div className="mb-3">
                                <p className="text-xs font-semibold text-muted-foreground mb-3">
                                  Split breakdown
                                  {expense.splitType === 'parts' && (
                                    <span className="ml-2 text-xs font-normal">(By parts)</span>
                                  )}
                                  {expense.splitType === 'shares' && (
                                    <span className="ml-2 text-xs font-normal">(By shares)</span>
                                  )}
                                  {expense.splitType === 'percentage' && (
                                    <span className="ml-2 text-xs font-normal">(By percentage)</span>
                                  )}
                                  {expense.splitType === 'exact' && (
                                    <span className="ml-2 text-xs font-normal">(Exact amounts)</span>
                                  )}
                                  {expense.splitType === 'unequal' && (
                                    <span className="ml-2 text-xs font-normal">(Selected people)</span>
                                  )}
                                  {expense.splitType === 'transfer' && (
                                    <span className="ml-2 text-xs font-normal">(Transfer)</span>
                                  )}
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pb-2">
                                  {members.map(member => {
                                    const memberSplit = expense.splits[member.id] || 0
                                    const memberParts = expense.parts?.[member.id] || 0
                                    const memberPercent = expense.percentages?.[member.id] || 0
                                    const shouldShow = expense.splitType === 'equal' || memberSplit > 0

                                    if (!shouldShow) return null

                                    return (
                                      <div key={member.id} className="p-2.5 bg-card border border-border rounded-lg">
                                        <div className="flex flex-col items-center gap-1.5 text-center">
                                          <MemberAvatar member={member} size="md" className="h-8 w-8" />
                                          <div>
                                            <p className="text-sm font-semibold text-foreground">{member.name}</p>
                                            {expense.splitType === 'parts' && memberParts > 0 && (
                                              <p className="text-xs text-muted-foreground">
                                                {memberParts} {memberParts === 1 ? 'part' : 'pts'}
                                              </p>
                                            )}
                                            {expense.splitType === 'shares' && memberParts > 0 && (
                                              <p className="text-xs text-muted-foreground">
                                                {memberParts} {memberParts === 1 ? 'share' : 'shares'}
                                              </p>
                                            )}
                                            {expense.splitType === 'percentage' && memberPercent > 0 && (
                                              <p className="text-xs text-muted-foreground">
                                                {memberPercent}%
                                              </p>
                                            )}
                                          </div>
                                          <span className="text-lg font-bold text-foreground tabular-nums">
                                            ₹{memberSplit.toFixed(2)}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            {expense.attachments && expense.attachments.length > 0 && (
                              <div className="mt-3 pt-2 border-t border-border">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">
                                  Attachments ({expense.attachments.length})
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {expense.attachments.map((url, idx) => (
                                    <img
                                      key={idx}
                                      src={url}
                                      alt={`Attachment ${idx + 1}`}
                                      className="w-16 h-16 object-cover rounded-md border border-border cursor-pointer hover:opacity-80 transition-opacity"
                                      onClick={() => {
                                        setViewerImages(expense.attachments || [])
                                        setShowImageViewer(true)
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <AddExpenseDialogModern
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open)
          if (!open) setEditingExpense(null)
        }}
        onAdd={handleAddExpense}
        editingExpense={editingExpense}
        members={members}
        currentUserId={currentUserId}
        isPersonalWorkspace={isPersonalWorkspace}
      />

      {!isPersonalWorkspace && (
        <RecordSettlementDialog
          open={showSettlementDialog}
          onOpenChange={setShowSettlementDialog}
          onAdd={handleAddExpense}
          members={members}
          currentUserId={currentUserId}
        />
      )}

      <ImageViewer
        images={viewerImages}
        open={showImageViewer}
        onOpenChange={setShowImageViewer}
      />

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected expenses?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedExpenses.size} expense{selectedExpenses.size === 1 ? '' : 's'} and adjust all balances. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteExpenseId} onOpenChange={(open) => !open && setDeleteExpenseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this expense and adjust all balances. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                const expense = expenses?.find(e => e.id === deleteExpenseId)
                if (expense) handleDelete(expense)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function calculateBalances(expenses: Expense[], members: Member[]): Record<string, number> {
  const balances: Record<string, number> = {}
  
  members.forEach(member => {
    balances[member.id] = 0
  })

  expenses.forEach(expense => {
    if (expense.splitType === 'transfer') {
      const transferAmount = Object.values(expense.splits || {}).reduce((sum, val) => sum + val, 0) || expense.amount
      balances[expense.paidBy] += transferAmount
      Object.entries(expense.splits).forEach(([memberId, amount]) => {
        balances[memberId] -= amount
      })
      return
    }

    balances[expense.paidBy] += expense.amount

    Object.entries(expense.splits).forEach(([memberId, amount]) => {
      balances[memberId] -= amount
    })
  })

  return balances
}

function calculateSettlements(balances: Record<string, number>): Array<{ from: string; to: string; amount: number }> {
  const settlements: Array<{ from: string; to: string; amount: number }> = []
  
  const creditors = Object.entries(balances)
    .filter(([, balance]) => balance > 0.01)
    .map(([id, balance]) => ({ id, balance }))
    .sort((a, b) => b.balance - a.balance)

  const debtors = Object.entries(balances)
    .filter(([, balance]) => balance < -0.01)
    .map(([id, balance]) => ({ id, balance: -balance }))
    .sort((a, b) => b.balance - a.balance)

  let i = 0
  let j = 0

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i]
    const debtor = debtors[j]
    const amount = Math.min(creditor.balance, debtor.balance)

    settlements.push({
      from: debtor.id,
      to: creditor.id,
      amount,
    })

    creditor.balance -= amount
    debtor.balance -= amount

    if (creditor.balance < 0.01) i++
    if (debtor.balance < 0.01) j++
  }

  return settlements
}

function calculateMemberExpenses(expenses: Expense[], members: Member[]): Record<string, { total: number; count: number; byCategory: Record<string, number> }> {
  const memberExpenses: Record<string, { total: number; count: number; byCategory: Record<string, number> }> = {}
  
  members.forEach(member => {
    memberExpenses[member.id] = { total: 0, count: 0, byCategory: {} }
  })

  expenses.forEach(expense => {
    if (expense.splitType === 'transfer') return
    const member = memberExpenses[expense.paidBy]
    if (member) {
      member.total += expense.amount
      member.count += 1
      
      const category = expense.category || 'Other'
      if (!member.byCategory[category]) {
        member.byCategory[category] = 0
      }
      member.byCategory[category] += expense.amount
    }
  })

  return memberExpenses
}
