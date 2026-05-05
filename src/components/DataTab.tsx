import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DownloadSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { type Expense, type Activity, type Member } from '@/lib/supabase-service'
import { formatToIST } from '@/lib/utils'

interface DataTabProps {
  expenses: Expense[]
  activities: Activity[]
  members: Member[]
}

export default function DataTab({ expenses, activities, members }: DataTabProps) {
  
  // Helper function to calculate paid/share/balance matching Analytics logic
  const calculateBalances = (
    expenses: Expense[],
    members: Member[],
  ): Record<string, { paid: number; share: number; balance: number }> => {
    const totals: Record<string, { paid: number; share: number; balance: number }> = {}
    members.forEach(member => {
      totals[member.id] = { paid: 0, share: 0, balance: 0 }
    })

    expenses?.forEach(expense => {
      if (expense.splitType === 'transfer') {
        // Transfer acts like money movement: sender pays out, receiver gets credited (reduces their outgoing)
        const sender = totals[expense.paidBy]
        if (sender) {
          sender.paid += expense.amount
        }

        Object.entries(expense.splits || {}).forEach(([memberId, amount]) => {
          const receiver = totals[memberId]
          if (receiver) {
            receiver.paid -= amount
          }
        })
        return
      }

      // Regular expense: payer paid the amount
      const payer = totals[expense.paidBy]
      if (payer) {
        payer.paid += expense.amount
      }

      // Track each member's share (responsibility)
      const splits = expense.splits && Object.keys(expense.splits).length > 0
        ? expense.splits
        : Object.fromEntries(members.map(m => [m.id, expense.amount / members.length]))

      Object.entries(splits).forEach(([memberId, amount]) => {
        const memberTotals = totals[memberId]
        if (memberTotals) {
          memberTotals.share += amount
        }
      })
    })

    // Final balance = paid - share
    Object.values(totals).forEach(entry => {
      entry.balance = entry.paid - entry.share
    })

    return totals
  }

  const spendingExpenses = expenses?.filter(exp => exp.splitType !== 'transfer') || []

  // Helper function to calculate settlements
  const calculateSettlements = (balances: Record<string, number>): Array<{ from: string; to: string; amount: number }> => {
    const settlements: Array<{ from: string; to: string; amount: number }> = []
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
        amount: Number(amount.toFixed(2))
      })

      debtors[i] = [debtorId, debtorBalance + amount]
      creditors[j] = [creditorId, creditorBalance - amount]

      if (Math.abs(debtors[i][1]) < 0.01) i++
      if (Math.abs(creditors[j][1]) < 0.01) j++
    }

    return settlements
  }

  // Helper function to get member name by ID
  const getMemberName = (memberId: string): string => {
    return members.find(m => m.id === memberId)?.name || 'Unknown'
  }

  // Export all data in one comprehensive PDF
  const exportAllData = () => {
    try {
      const doc = new jsPDF()
      let currentY = 20

      // ===== TITLE =====
      doc.setFontSize(22)
      doc.setTextColor(40, 40, 40)
      doc.text('Expensio - Complete Workspace Report', 14, currentY)
      currentY += 10

      // Date generated
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Generated on: ${formatToIST(new Date().toISOString()).split(',')[0]}`, 14, currentY)
      currentY += 12

      // ===== SUMMARY STATISTICS =====
      doc.setFontSize(14)
      doc.setTextColor(40, 40, 40)
      doc.text('Summary Statistics', 14, currentY)
      currentY += 8

      const spendingExpensesLocal = expenses.filter(exp => exp.splitType !== 'transfer')
      const totalExpenses = spendingExpensesLocal.reduce((sum, exp) => sum + exp.amount, 0)
      const avgExpense = spendingExpensesLocal.length > 0 ? totalExpenses / spendingExpensesLocal.length : 0
      const memberTotals = calculateBalances(expenses, members)
      const balances = Object.fromEntries(Object.entries(memberTotals).map(([id, data]) => [id, data.balance]))

      doc.setFontSize(11)
      doc.setTextColor(60, 60, 60)
      doc.text(`Total Expenses: Rs ${totalExpenses.toFixed(2)}`, 14, currentY)
      currentY += 6
      doc.text(`Number of Transactions: ${expenses.length}`, 14, currentY)
      currentY += 6
      doc.text(`Number of Members: ${members.length}`, 14, currentY)
      currentY += 6
      doc.text(`Average Expense: Rs ${avgExpense.toFixed(2)}`, 14, currentY)
      currentY += 12

      // ===== MEMBER BALANCES =====
      doc.setFontSize(14)
      doc.setTextColor(40, 40, 40)
      doc.text('Member Balances', 14, currentY)
      currentY += 7

      const balanceData = members.map(member => {
        const balance = balances[member.id]
        const status = balance > 0 ? 'Gets Back' : balance < 0 ? 'Owes' : 'Settled'
        return [
          member.name,
          `Rs ${Math.abs(balance).toFixed(2)}`,
          status
        ]
      })

      autoTable(doc, {
        startY: currentY,
        head: [['Member', 'Amount', 'Status']],
        body: balanceData,
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241], textColor: 255 },
        bodyStyles: { textColor: 50 },
        styles: { fontSize: 10 },
      })

      currentY = (doc as any).lastAutoTable.finalY + 15

      // ===== SETTLEMENTS =====
      const settlements = calculateSettlements(balances)
      if (settlements.length > 0) {
        doc.setFontSize(14)
        doc.setTextColor(40, 40, 40)
        doc.text('Recommended Settlements', 14, currentY)
        currentY += 7

        const settlementData = settlements.map(settlement => [
          getMemberName(settlement.from),
          getMemberName(settlement.to),
          `Rs ${settlement.amount.toFixed(2)}`
        ])

        autoTable(doc, {
          startY: currentY,
          head: [['From', 'To', 'Amount']],
          body: settlementData,
          theme: 'grid',
          headStyles: { fillColor: [34, 197, 94], textColor: 255 },
          bodyStyles: { textColor: 50 },
          styles: { fontSize: 10 },
        })

        currentY = (doc as any).lastAutoTable.finalY + 15
      }

      // ===== DETAILED EXPENSES =====
      if (currentY > 250) {
        doc.addPage()
        currentY = 20
      }

      doc.setFontSize(14)
      doc.setTextColor(40, 40, 40)
      doc.text('All Expenses', 14, currentY)
      currentY += 7

      const expenseData = expenses.map(exp => [
        formatToIST(exp.date).split(',')[0],
        exp.description.substring(0, 20),
        exp.category || '-',
        getMemberName(exp.paidBy),
        `Rs ${exp.amount.toFixed(2)}`,
        exp.splitType
      ])

      autoTable(doc, {
        startY: currentY,
        head: [['Date', 'Description', 'Category', 'Paid By', 'Amount', 'Type']],
        body: expenseData,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        bodyStyles: { textColor: 50 },
        styles: { fontSize: 9 },
      })

      currentY = (doc as any).lastAutoTable.finalY + 15

      // ===== MEMBER BREAKDOWN =====
      if (currentY > 250) {
        doc.addPage()
        currentY = 20
      }

      doc.setFontSize(14)
      doc.setTextColor(40, 40, 40)
      doc.text('Individual Member Breakdown', 14, currentY)
      currentY += 7

      const memberExpenses = members.map(member => {
        const totals = memberTotals[member.id] || { paid: 0, share: 0, balance: 0 }

        return [
          member.name,
          `Rs ${totals.paid.toFixed(2)}`,
          `Rs ${totals.share.toFixed(2)}`,
          `Rs ${totals.balance.toFixed(2)}`
        ]
      })

      autoTable(doc, {
        startY: currentY,
        head: [['Member', 'Total Paid', 'Total Share', 'Balance']],
        body: memberExpenses,
        theme: 'grid',
        headStyles: { fillColor: [139, 92, 246], textColor: 255 },
        bodyStyles: { textColor: 50 },
        styles: { fontSize: 10 },
      })

      currentY = (doc as any).lastAutoTable.finalY + 15

      // ===== CATEGORY BREAKDOWN =====
      if (currentY > 250) {
        doc.addPage()
        currentY = 20
      }

      const categoryMap = new Map<string, number>()
      spendingExpensesLocal.forEach(exp => {
        const current = categoryMap.get(exp.category) || 0
        categoryMap.set(exp.category, current + exp.amount)
      })

      const categoryData = Array.from(categoryMap.entries()).map(([category, amount]) => [
        category,
        `Rs ${amount.toFixed(2)}`,
        totalExpenses > 0 ? `${((amount / totalExpenses) * 100).toFixed(1)}%` : '0%'
      ])

      doc.setFontSize(14)
      doc.setTextColor(40, 40, 40)
      doc.text('Expenses by Category', 14, currentY)
      currentY += 7

      autoTable(doc, {
        startY: currentY,
        head: [['Category', 'Amount', 'Percentage']],
        body: categoryData,
        theme: 'grid',
        headStyles: { fillColor: [236, 72, 153], textColor: 255 },
        bodyStyles: { textColor: 50 },
        styles: { fontSize: 10 },
      })

      // ===== FOOTER =====
      const totalPages = (doc as any).internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFontSize(9)
        doc.setTextColor(150, 150, 150)
        doc.text(
          `Page ${i} of ${totalPages}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        )
      }

      doc.save(`expensio-complete-report-${new Date().getTime()}.pdf`)
      toast.success('Complete report exported successfully!')
    } catch (error) {
      console.error('Error exporting complete data:', error)
      toast.error('Failed to export complete report')
    }
  }

  return (
    <>
      <div className="mb-4 sm:mb-6">
        <h2 className="text-xl font-bold text-foreground mb-1">Export All Data</h2>
        <p className="text-sm text-muted-foreground">Download a comprehensive report containing all expense data, balances, settlements, and analytics</p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-2 hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-primary/10 rounded-lg">
                <DownloadSimple className="h-6 w-6 text-primary" weight="fill" />
              </div>
              <CardTitle className="text-lg">Complete Workspace Report</CardTitle>
            </div>
            <CardDescription>
              Export a single PDF with summary, balances, settlements, expenses, member breakdown, and category analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={exportAllData}
              className="w-full gap-2"
              size="lg"
              disabled={expenses.length === 0}
            >
              <DownloadSimple className="h-5 w-5" weight="bold" />
              Export Complete Report (PDF)
            </Button>
            {expenses.length === 0 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                No expenses to export yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Summary Section */}
        {expenses.length > 0 && (
          <Card className="bg-gradient-to-br from-primary/5 via-accent/5 to-primary/5 border-2">
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="text-center p-3 bg-card/50 rounded-lg">
                  <p className="text-2xl font-bold text-primary">
                    {spendingExpenses.length}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Expenses</p>
                </div>
                <div className="text-center p-3 bg-card/50 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-600">
                    ₹{spendingExpenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(0)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Amount</p>
                </div>
                <div className="text-center p-3 bg-card/50 rounded-lg">
                  <p className="text-2xl font-bold text-violet-600">
                    {members.length}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Members</p>
                </div>
                <div className="text-center p-3 bg-card/50 rounded-lg">
                  <p className="text-2xl font-bold text-accent">
                    ₹{(spendingExpenses.reduce((sum, exp) => sum + exp.amount, 0) / (members.length || 1)).toFixed(0)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Per Person</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
