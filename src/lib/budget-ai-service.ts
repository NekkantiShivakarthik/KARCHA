import type { Expense, Member } from '@/lib/supabase-service'

const normalizeResponsesUrl = (baseUrl: string) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/v1/responses')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/responses`
  return `${trimmed}/v1/responses`
}

const openAiBaseUrl =
  import.meta.env.VITE_OPENAI_BASE_URL?.trim() ||
  import.meta.env.ai_base_url?.trim() ||
  'https://api.openai.com'

const OPENAI_API_URL = normalizeResponsesUrl(openAiBaseUrl)
const OPENAI_API_KEY =
  import.meta.env.VITE_OPENAI_API_KEY?.trim() ||
  import.meta.env.VITE_AI_API_KEY?.trim() ||
  import.meta.env.ai_api_key?.trim() ||
  ''
const OPENAI_MODEL =
  import.meta.env.VITE_OPENAI_MODEL?.trim() ||
  import.meta.env.VITE_AI_MODEL?.trim() ||
  import.meta.env.ai_model?.trim() ||
  'gpt-4.1-mini'
const MAX_RECENT_EXPENSES = 35
const MAX_HISTORY_MESSAGES = 10

const amountFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export type BudgetChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type AskBudgetAssistantInput = {
  question: string
  expenses: Expense[]
  members: Member[]
  history?: BudgetChatMessage[]
  workspaceName?: string
  isPersonalWorkspace?: boolean
}

const formatAmount = (value: number) => amountFormatter.format(Number.isFinite(value) ? value : 0)

const formatDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return dateFormatter.format(parsed)
}

const buildWorkspaceContext = ({
  expenses,
  members,
  workspaceName,
  isPersonalWorkspace = false,
}: Omit<AskBudgetAssistantInput, 'question' | 'history'>) => {
  const spendingExpenses = expenses.filter((expense) => expense.splitType !== 'transfer')
  const transferExpenses = expenses.filter((expense) => expense.splitType === 'transfer')

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  let totalSpend = 0
  let currentMonthSpend = 0

  const categoryTotals = new Map<string, number>()
  const paidTotals = new Map<string, number>()
  const shareTotals = new Map<string, number>()

  for (const member of members) {
    paidTotals.set(member.id, 0)
    shareTotals.set(member.id, 0)
  }

  for (const expense of spendingExpenses) {
    const amount = Number(expense.amount || 0)
    totalSpend += amount

    const occurredAt = new Date(expense.date)
    if (!Number.isNaN(occurredAt.getTime()) && occurredAt.getMonth() === currentMonth && occurredAt.getFullYear() === currentYear) {
      currentMonthSpend += amount
    }

    const category = expense.category || 'Other'
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount)

    paidTotals.set(expense.paidBy, (paidTotals.get(expense.paidBy) || 0) + amount)

    for (const [memberId, shareAmount] of Object.entries(expense.splits || {})) {
      shareTotals.set(memberId, (shareTotals.get(memberId) || 0) + Number(shareAmount || 0))
    }
  }

  const memberNameById = new Map<string, string>()
  for (const member of members) {
    memberNameById.set(member.id, member.name)
  }

  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, amount]) => `- ${category}: ₹${formatAmount(amount)}`)

  const memberBalances = Array.from(
    new Set([...paidTotals.keys(), ...shareTotals.keys()]),
  )
    .map((memberId) => {
      const paid = paidTotals.get(memberId) || 0
      const share = shareTotals.get(memberId) || 0
      const net = paid - share
      const name = memberNameById.get(memberId) || memberId
      return { name, paid, share, net }
    })
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .map((entry) => {
      const direction = entry.net >= 0 ? 'should receive' : 'owes'
      return `- ${entry.name}: paid ₹${formatAmount(entry.paid)}, share ₹${formatAmount(entry.share)}, ${direction} ₹${formatAmount(Math.abs(entry.net))}`
    })

  const recentExpenses = [...spendingExpenses]
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    })
    .slice(0, MAX_RECENT_EXPENSES)
    .map((expense) => {
      const payerName = memberNameById.get(expense.paidBy) || expense.paidBy
      return `- ${formatDate(expense.date)} | ${expense.category || 'Other'} | ${expense.description || 'Expense'} | ₹${formatAmount(expense.amount)} | paid by ${payerName}`
    })

  return [
    `Workspace Name: ${workspaceName || 'Current workspace'}`,
    `Workspace Type: ${isPersonalWorkspace ? 'personal' : 'shared'}`,
    `Total Expenses Recorded: ${expenses.length}`,
    `Spending Expenses (non-transfer): ${spendingExpenses.length}`,
    `Transfer Entries: ${transferExpenses.length}`,
    `Total Spend (non-transfer): ₹${formatAmount(totalSpend)}`,
    `Current Month Spend (non-transfer): ₹${formatAmount(currentMonthSpend)}`,
    '',
    'Top Categories:',
    topCategories.length ? topCategories.join('\n') : '- No category data',
    '',
    'Member Balances Snapshot:',
    memberBalances.length ? memberBalances.join('\n') : '- No member data',
    '',
    `Most Recent ${Math.min(recentExpenses.length, MAX_RECENT_EXPENSES)} Expenses:`,
    recentExpenses.length ? recentExpenses.join('\n') : '- No expenses recorded yet',
  ].join('\n')
}

const extractOutputText = (payload: any): string => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const blocks = Array.isArray(payload?.output) ? payload.output : []
  const texts: string[] = []

  for (const block of blocks) {
    const content = Array.isArray(block?.content) ? block.content : []
    for (const entry of content) {
      if (entry?.type === 'output_text' && typeof entry?.text === 'string' && entry.text.trim()) {
        texts.push(entry.text.trim())
      }
    }
  }

  return texts.join('\n\n').trim()
}

const toApiMessage = (message: BudgetChatMessage) => ({
  role: message.role,
  content: [{ type: 'input_text', text: message.content }],
})

export const hasBudgetAiConfig = () => OPENAI_API_KEY.length > 0

export const askBudgetAssistant = async (input: AskBudgetAssistantInput): Promise<string> => {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing AI API key in .env (VITE_OPENAI_API_KEY or ai_api_key).')
  }

  const question = input.question.trim()
  if (!question) {
    throw new Error('Please enter a question for the AI planner.')
  }

  const workspaceContext = buildWorkspaceContext(input)
  const history = (input.history || [])
    .map((message) => ({ ...message, content: message.content.trim() }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES)
    .map(toApiMessage)

  const systemPrompt = [
    'You are Expensio Budget Planner, a practical finance assistant for workspace expenses.',
    'Use only the provided workspace context and user question.',
    'Do not invent values that are not present in the context.',
    'If data is missing, say what is missing and continue with a best-effort recommendation.',
    'Keep responses concise and actionable.',
    'Use INR currency format.',
    'When asked for a plan, provide: Budget Snapshot, Suggested Limits, and 3 concrete next actions.',
  ].join(' ')

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        ...history,
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Workspace context:',
                workspaceContext,
                '',
                `User question: ${question}`,
              ].join('\n'),
            },
          ],
        },
      ],
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const apiMessage =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `AI request failed with status ${response.status}`
    throw new Error(apiMessage)
  }

  const answer = extractOutputText(payload)
  if (!answer) {
    throw new Error('No response text was returned by the AI model.')
  }

  return answer
}
