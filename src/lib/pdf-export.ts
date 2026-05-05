import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { type Expense } from '@/lib/supabase-service'
import { type Member } from '@/lib/supabase-service'
import { formatToIST } from './utils'

export async function exportToPDF(
  expenses: Expense[],
  members: Member[],
  chartRefs: { [key: string]: HTMLElement | null },
  options?: { isPersonalWorkspace?: boolean }
) {
  const isPersonalWorkspace = options?.isPersonalWorkspace ?? false
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  let yPosition = 15

  // Title
  pdf.setFontSize(24)
  pdf.setTextColor(40, 40, 40)
  pdf.text(isPersonalWorkspace ? 'Expensio - Personal Expense Report' : 'Expensio - Expense Report', 15, yPosition)
  yPosition += 12

  // Date generated
  pdf.setFontSize(9)
  pdf.setTextColor(120, 120, 120)
  pdf.text(`Generated on: ${formatToIST(new Date().toISOString())}`, 15, yPosition)
  yPosition += 8

  // Summary Section
  pdf.setDrawColor(200, 200, 200)
  pdf.line(15, yPosition, pageWidth - 15, yPosition)
  yPosition += 6

  pdf.setFontSize(14)
  pdf.setTextColor(40, 40, 40)
  pdf.text('Summary', 15, yPosition)
  yPosition += 8

  const analyticsExpenses = expenses.filter(e => e.splitType !== 'transfer')
  const totalExpenses = analyticsExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

  pdf.setFontSize(11)
  pdf.setTextColor(60, 60, 60)
  
  const summaryData = [
    [`Total Expenses: ₹${totalExpenses.toFixed(2)}`],
    [`Total Members: ${members.length}`],
    [`Total Transactions: ${analyticsExpenses.length}`],
    [`Average Expense: ₹${(totalExpenses / Math.max(analyticsExpenses.length, 1)).toFixed(2)}`],
    [`Workspace Type: ${isPersonalWorkspace ? 'Personal Workspace' : 'Shared Workspace'}`],
  ]

  summaryData.forEach(([text]) => {
    pdf.text(text, 15, yPosition)
    yPosition += 7
  })

  yPosition += 5

  if (!isPersonalWorkspace) {
    // Member Details
    if (yPosition > 240) {
      pdf.addPage()
      yPosition = 15
    }

    pdf.setDrawColor(200, 200, 200)
    pdf.line(15, yPosition, pageWidth - 15, yPosition)
    yPosition += 6

    pdf.setFontSize(14)
    pdf.setTextColor(40, 40, 40)
    pdf.text('Member Breakdown', 15, yPosition)
    yPosition += 10

    pdf.setFontSize(10)
    pdf.setTextColor(60, 60, 60)

    members.forEach((member) => {
      const memberExpenses = analyticsExpenses.filter(e => e.paidBy === member.id)
      const totalPaid = memberExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
      const totalOwes = analyticsExpenses.reduce((sum, e) => sum + (e.splits?.[member.id] || 0), 0)
      const balance = totalPaid - totalOwes

      if (yPosition > 250) {
        pdf.addPage()
        yPosition = 15
      }

      pdf.text(`${member.name}:`, 15, yPosition)
      yPosition += 5
      pdf.setFontSize(9)
      pdf.text(`  Paid: ₹${totalPaid.toFixed(2)}`, 15, yPosition)
      yPosition += 4
      pdf.text(`  Responsible for: ₹${totalOwes.toFixed(2)}`, 15, yPosition)
      yPosition += 4
      
      if (balance > 0) {
        pdf.setTextColor(34, 139, 34)
      } else {
        pdf.setTextColor(220, 20, 60)
      }
      pdf.text(
        `  Balance: ${balance > 0 ? 'Gets back' : 'Owes'} ₹${Math.abs(balance).toFixed(2)}`,
        15,
        yPosition
      )
      pdf.setTextColor(60, 60, 60)
      yPosition += 7
    })

    yPosition += 3
  }

  // Add Charts
  const chartsToAdd = isPersonalWorkspace
    ? [
        { name: 'Personal Spending by Category', ref: chartRefs.expensesByCategory },
        { name: 'Top Expenses', ref: chartRefs.expensesByMember },
        { name: 'Spending Over Time', ref: chartRefs.expensesOverTime },
        { name: 'Cumulative Spend', ref: chartRefs.memberSpending },
        { name: 'Personal Snapshot', ref: chartRefs.memberBalances },
      ]
    : [
        { name: 'Expenses by Category', ref: chartRefs.expensesByCategory },
        { name: 'Expenses by Member', ref: chartRefs.expensesByMember },
        { name: 'Expenses Over Time', ref: chartRefs.expensesOverTime },
        { name: 'Member Spending Distribution', ref: chartRefs.memberSpending },
        { name: 'Member Balance Summary', ref: chartRefs.memberBalances },
      ]

  for (const chart of chartsToAdd) {
    if (!chart.ref) continue

    pdf.addPage()
    yPosition = 15

    pdf.setFontSize(14)
    pdf.setTextColor(40, 40, 40)
    pdf.text(chart.name, 15, yPosition)
    yPosition += 10

    try {
      const canvas = await html2canvas(chart.ref, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = pageWidth - 30
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Ensure it fits on page
      if (imgHeight > pageHeight - 40) {
        const scaledHeight = pageHeight - 40
        pdf.addImage(imgData, 'PNG', 15, yPosition, imgWidth, scaledHeight)
      } else {
        pdf.addImage(imgData, 'PNG', 15, yPosition, imgWidth, imgHeight)
      }
    } catch (error) {
      console.error(`Failed to capture ${chart.name}:`, error)
      pdf.setTextColor(200, 0, 0)
      pdf.text(`Failed to capture ${chart.name} chart`, 15, yPosition)
    }
  }

  // Detailed Expenses Table
  pdf.addPage()
  yPosition = 15

  pdf.setFontSize(14)
  pdf.setTextColor(40, 40, 40)
  pdf.text('Detailed Expenses', 15, yPosition)
  yPosition += 10

  // Create table data
  const tableData = analyticsExpenses.map(e => [
    formatToIST(e.date).split(',')[0], // Date
    e.description.substring(0, 20), // Description
    e.category,
    members.find(m => m.id === e.paidBy)?.name || 'Unknown',
    `₹${Number(e.amount).toFixed(2)}`,
  ])

  // Simple table rendering
  pdf.setFontSize(9)
  pdf.setTextColor(60, 60, 60)

  const colWidths = [25, 35, 25, 30, 25]
  const headers = ['Date', 'Description', 'Category', 'Paid By', 'Amount']

  // Header row
  pdf.setTextColor(40, 40, 40)
  pdf.setFont('helvetica', 'bold')
  let xPos = 15
  headers.forEach((header, i) => {
    pdf.text(header, xPos, yPosition)
    xPos += colWidths[i]
  })

  yPosition += 5
  pdf.setDrawColor(200, 200, 200)
  pdf.line(15, yPosition, pageWidth - 15, yPosition)
  yPosition += 4

  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(80, 80, 80)

  // Data rows
  tableData.forEach((row) => {
    if (yPosition > 270) {
      pdf.addPage()
      yPosition = 15
    }

    xPos = 15
    row.forEach((cell, i) => {
      const cellText = String(cell).substring(0, 15) // Truncate long text
      pdf.text(cellText, xPos, yPosition)
      xPos += colWidths[i]
    })
    yPosition += 5
  })

  // Footer
  pdf.setFontSize(8)
  pdf.setTextColor(150, 150, 150)
  pdf.text(
    'This report was generated by Expensio',
    15,
    pageHeight - 10
  )

  pdf.save(`expensio-report-${new Date().getTime()}.pdf`)
}
