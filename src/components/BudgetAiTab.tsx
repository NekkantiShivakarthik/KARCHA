import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { askBudgetAssistant, hasBudgetAiConfig, type BudgetChatMessage } from '@/lib/budget-ai-service'
import { type Expense, type Member } from '@/lib/supabase-service'
import { Broom, PaperPlaneTilt, Sparkle, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'

type BudgetAiTabProps = {
  expenses: Expense[]
  members: Member[]
  workspaceName?: string
  isPersonalWorkspace?: boolean
}

const STARTER_PROMPTS = [
  'Create a monthly budget plan from my current spending pattern.',
  'Which top categories should I cut first and by how much?',
  'Give me a 30-day action plan to reduce spending by 15%.',
  'What warning signals do you see in my recent expenses?',
]

const greetingMessage: BudgetChatMessage = {
  role: 'assistant',
  content: 'I can help you build a budget plan from your workspace expenses. Ask anything about spending limits, category cuts, or monthly targets.',
}

const amountFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatAmount = (value: number) => amountFormatter.format(Number.isFinite(value) ? value : 0)

export default function BudgetAiTab({
  expenses,
  members,
  workspaceName,
  isPersonalWorkspace = false,
}: BudgetAiTabProps) {
  const [messages, setMessages] = useState<BudgetChatMessage[]>([greetingMessage])
  const [question, setQuestion] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const aiConfigured = hasBudgetAiConfig()
  const spendingExpenses = expenses.filter((expense) => expense.splitType !== 'transfer')

  const snapshot = useMemo(() => {
    const totalSpend = spendingExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)

    const topCategory = Array.from(
      spendingExpenses.reduce((map, expense) => {
        const key = expense.category || 'Other'
        map.set(key, (map.get(key) || 0) + Number(expense.amount || 0))
        return map
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])[0]

    return {
      expenseCount: spendingExpenses.length,
      totalSpend,
      topCategory: topCategory?.[0] || 'N/A',
      topCategoryAmount: topCategory?.[1] || 0,
    }
  }, [spendingExpenses])

  const handleAsk = async (forcedQuestion?: string) => {
    if (isLoading || !aiConfigured) return

    const nextQuestion = (forcedQuestion ?? question).trim()
    if (!nextQuestion) return

    const userMessage: BudgetChatMessage = { role: 'user', content: nextQuestion }
    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setQuestion('')
    setIsLoading(true)

    try {
      const answer = await askBudgetAssistant({
        question: nextQuestion,
        expenses,
        members,
        history: nextMessages,
        workspaceName,
        isPersonalWorkspace,
      })

      setMessages((current) => [...current, { role: 'assistant', content: answer }])
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not get AI response.'
      toast.error(errorMessage)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `I could not generate a response right now. ${errorMessage}`,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-foreground">AI Budget Planner</h2>
        <Badge variant="outline" className="border-primary/40 text-primary">
          Beta
        </Badge>
      </div>

      {!aiConfigured && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 p-4">
            <WarningCircle className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-300" weight="fill" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-200">
                AI key is missing
              </p>
              <p className="text-sm text-amber-700/85 dark:text-amber-100/90">
                Add <code>VITE_OPENAI_API_KEY</code>, <code>VITE_AI_API_KEY</code>, or <code>ai_api_key</code> in your <code>.env</code> file and restart the app.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-border/70 bg-card/85">
          <CardHeader>
            <CardTitle>Chat</CardTitle>
            <CardDescription>Ask budget questions using your expense data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScrollArea className="h-[420px] rounded-lg border border-border/60 bg-background/50 p-3">
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn(
                      'max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                      message.role === 'assistant'
                        ? 'bg-muted text-foreground'
                        : 'ml-auto bg-primary text-primary-foreground',
                    )}
                  >
                    {message.content}
                  </div>
                ))}
                {isLoading && (
                  <div className="max-w-[92%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Thinking...
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="space-y-2">
              <Textarea
                placeholder="Ask for a budget plan, spending limit, or savings strategy..."
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleAsk()
                  }
                }}
                rows={4}
                disabled={!aiConfigured || isLoading}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void handleAsk()}
                  disabled={!aiConfigured || isLoading || !question.trim()}
                  className="gap-2"
                >
                  <PaperPlaneTilt className="h-4 w-4" weight="fill" />
                  Ask AI
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setMessages([greetingMessage])}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <Broom className="h-4 w-4" />
                  Clear chat
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border border-border/70 bg-card/85">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkle className="h-4 w-4 text-primary" weight="fill" />
                Suggested Prompts
              </CardTitle>
              <CardDescription>Quick questions for faster planning.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {STARTER_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal text-left"
                  disabled={!aiConfigured || isLoading}
                  onClick={() => void handleAsk(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/85">
            <CardHeader>
              <CardTitle>Workspace Snapshot</CardTitle>
              <CardDescription>
                {workspaceName || 'Current workspace'} · {isPersonalWorkspace ? 'Personal' : 'Shared'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <span className="text-muted-foreground">Members</span>
                <span className="font-semibold">{members.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <span className="text-muted-foreground">Expenses</span>
                <span className="font-semibold">{snapshot.expenseCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <span className="text-muted-foreground">Total Spend</span>
                <span className="font-semibold">₹{formatAmount(snapshot.totalSpend)}</span>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <p className="text-muted-foreground">Top Category</p>
                <p className="font-semibold">
                  {snapshot.topCategory} · ₹{formatAmount(snapshot.topCategoryAmount)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
