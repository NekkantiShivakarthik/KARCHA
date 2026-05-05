import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretDown, Image as ImageIcon, X } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DEFAULT_CATEGORIES, type Expense } from '@/App'
import { type Member } from '@/lib/supabase-service'
import MemberAvatar from '@/components/MemberAvatar'
import { toast } from 'sonner'
import { storeImage, deleteImages } from '@/lib/image-storage'
import { useImages } from '@/hooks/use-images'
import { getISTTimestamp } from '@/lib/utils'

interface AddExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (expense: Expense) => void
  editingExpense: Expense | null
  members: Member[]
  currentUserId?: string | null
  isPersonalWorkspace?: boolean
}

type SplitType = Expense['splitType']

interface SplitComputation {
  splits: Record<string, number>
  partsData?: Record<string, number>
  percentagesData?: Record<string, number>
  error?: string
}

const MAIN_SPLIT_OPTIONS: Array<{ id: SplitType; label: string; hint: string }> = [
  { id: 'equal', label: 'Split equally', hint: 'Everyone pays the same amount' },
  { id: 'unequal', label: 'Selected people', hint: 'Split equally among selected members' },
  { id: 'percentage', label: 'By percentage', hint: 'Set % share for each person' },
]

const ADVANCED_SPLIT_OPTIONS: Array<{ id: SplitType; label: string; hint: string }> = [
  { id: 'exact', label: 'Exact amounts', hint: 'Type exact amount per person' },
  { id: 'parts', label: 'By ratio', hint: 'Use parts like 2:1:1' },
  { id: 'shares', label: 'By shares', hint: 'Use whole-number shares' },
]

const CATEGORY_DOT_COLORS: Record<string, string> = {
  'Food & Drinks': 'bg-amber-500',
  Transportation: 'bg-sky-500',
  Accommodation: 'bg-indigo-500',
  Activities: 'bg-emerald-500',
  Shopping: 'bg-pink-500',
  Transfer: 'bg-violet-500',
  Other: 'bg-slate-500',
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const isAdvancedSplitType = (splitType: SplitType) => ADVANCED_SPLIT_OPTIONS.some((option) => option.id === splitType)

export default function AddExpenseDialogModern({
  open,
  onOpenChange,
  onAdd,
  editingExpense,
  members,
  currentUserId,
  isPersonalWorkspace = false,
}: AddExpenseDialogProps) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState<string>('')
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [transferTo, setTransferTo] = useState<string>('')
  const [attachmentIds, setAttachmentIds] = useState<string[]>([])
  const [parts, setParts] = useState<Record<string, string>>({})
  const [percentages, setPercentages] = useState<Record<string, string>>({})
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({})
  const [shares, setShares] = useState<Record<string, string>>({})
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [category, setCategory] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [showAdvancedSplitOptions, setShowAdvancedSplitOptions] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const imageIds = attachmentIds.filter((id) => !id.startsWith('http'))
  const { images: attachmentImages } = useImages(imageIds.length > 0 ? imageIds : undefined)
  const displayAttachments = attachmentIds.map((attachmentId) => {
    if (attachmentId.startsWith('http')) return attachmentId
    const idx = imageIds.indexOf(attachmentId)
    return idx >= 0 ? (attachmentImages[idx] || attachmentId) : attachmentId
  })

  const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories]))

  const defaultPaidBy = currentUserId && members.some((member) => member.id === currentUserId)
    ? currentUserId
    : ''

  const amountValue = Number.parseFloat(amount)
  const hasValidAmount = Number.isFinite(amountValue) && amountValue > 0
  const resolvedCategory = category === 'custom' ? customCategory.trim() : category

  const markTouched = (field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
  }

  const showError = (field: string) => submitted || !!touched[field]

  const buildDefaultIncludedMap = () => {
    const defaults: Record<string, boolean> = {}
    members.forEach((member) => {
      defaults[member.id] = true
    })
    return defaults
  }

  const computeSplitData = (totalAmount: number): SplitComputation => {
    if (members.length === 0) {
      return { splits: {}, error: 'Add at least one member before creating an expense.' }
    }

    const splits: Record<string, number> = {}

    if (isPersonalWorkspace) {
      const soloMemberId = paidBy || defaultPaidBy || members[0]?.id
      if (!soloMemberId) {
        return { splits, error: 'Could not resolve personal profile for this expense.' }
      }
      splits[soloMemberId] = totalAmount
      return { splits }
    }

    if (splitType === 'transfer') {
      if (!transferTo) {
        return { splits, error: 'Select who received this transfer.' }
      }
      if (transferTo === paidBy) {
        return { splits, error: 'Sender and receiver should be different.' }
      }
      splits[transferTo] = totalAmount
      return { splits }
    }

    if (splitType === 'equal') {
      const splitAmount = totalAmount / members.length
      members.forEach((member) => {
        splits[member.id] = splitAmount
      })
      return { splits }
    }

    if (splitType === 'unequal') {
      const includedMembers = members.filter((member) => included[member.id] ?? true)
      if (includedMembers.length === 0) {
        return { splits, error: 'Select at least one person to include in this split.' }
      }

      const splitAmount = totalAmount / includedMembers.length
      members.forEach((member) => {
        splits[member.id] = (included[member.id] ?? true) ? splitAmount : 0
      })
      return { splits }
    }

    if (splitType === 'percentage') {
      const percentData: Record<string, number> = {}
      let totalPercent = 0

      for (const member of members) {
        const rawValue = percentages[member.id] || '0'
        const percentValue = Number(rawValue)
        if (!Number.isFinite(percentValue) || percentValue < 0 || percentValue > 100) {
          return { splits, error: 'Enter valid percentages between 0 and 100.' }
        }
        percentData[member.id] = percentValue
        totalPercent += percentValue
      }

      if (Math.abs(totalPercent - 100) > 0.01) {
        return { splits, error: `Percentages must total 100%. Current total is ${totalPercent.toFixed(1)}%.` }
      }

      members.forEach((member) => {
        splits[member.id] = (percentData[member.id] / 100) * totalAmount
      })
      return { splits, percentagesData: percentData }
    }

    if (splitType === 'exact') {
      let totalExact = 0
      for (const member of members) {
        const rawValue = exactAmounts[member.id] || '0'
        const exactValue = Number(rawValue)
        if (!Number.isFinite(exactValue) || exactValue < 0) {
          return { splits, error: 'Enter valid exact amounts for every member.' }
        }
        splits[member.id] = exactValue
        totalExact += exactValue
      }

      if (Math.abs(totalExact - totalAmount) > 0.01) {
        return {
          splits,
          error: `Exact amounts must add up to ₹${totalAmount.toFixed(2)}. Current total is ₹${totalExact.toFixed(2)}.`,
        }
      }
      return { splits }
    }

    if (splitType === 'parts') {
      const partData: Record<string, number> = {}
      let totalParts = 0

      for (const member of members) {
        const rawValue = parts[member.id] || '0'
        const partValue = Number(rawValue)
        if (!Number.isFinite(partValue) || partValue < 0) {
          return { splits, error: 'Enter valid ratio values for everyone.' }
        }
        partData[member.id] = partValue
        totalParts += partValue
      }

      if (totalParts <= 0) {
        return { splits, error: 'Total ratio must be greater than 0.' }
      }

      members.forEach((member) => {
        splits[member.id] = (partData[member.id] / totalParts) * totalAmount
      })
      return { splits, partsData: partData }
    }

    if (splitType === 'shares') {
      const shareData: Record<string, number> = {}
      let totalShares = 0

      for (const member of members) {
        const rawValue = shares[member.id] || '0'
        const shareValue = Number(rawValue)
        if (!Number.isFinite(shareValue) || shareValue < 0 || !Number.isInteger(shareValue)) {
          return { splits, error: 'Shares must be whole numbers (0, 1, 2...).'}
        }
        shareData[member.id] = shareValue
        totalShares += shareValue
      }

      if (totalShares <= 0) {
        return { splits, error: 'Total shares must be greater than 0.' }
      }

      members.forEach((member) => {
        splits[member.id] = (shareData[member.id] / totalShares) * totalAmount
      })
      return { splits, partsData: shareData }
    }

    return { splits, error: 'Choose a valid split option.' }
  }

  const splitPreview = hasValidAmount ? computeSplitData(amountValue) : null

  const percentageTotal = members.reduce((sum, member) => sum + (Number(percentages[member.id]) || 0), 0)
  const exactTotal = members.reduce((sum, member) => sum + (Number(exactAmounts[member.id]) || 0), 0)
  const partsTotal = members.reduce((sum, member) => sum + (Number(parts[member.id]) || 0), 0)
  const sharesTotal = members.reduce((sum, member) => sum + (Number(shares[member.id]) || 0), 0)

  const descriptionError = description.trim() ? '' : 'Add a short title for this expense.'
  const amountError = hasValidAmount ? '' : 'Enter an amount greater than 0.'
  const paidByError = isPersonalWorkspace ? '' : (paidBy ? '' : 'Select who paid for this expense.')
  const categoryError = resolvedCategory ? '' : 'Choose a category.'
  const splitError = isPersonalWorkspace ? '' : (hasValidAmount ? (splitPreview?.error || '') : '')

  const canSubmit =
    !descriptionError &&
    !amountError &&
    !paidByError &&
    !categoryError &&
    !splitError &&
    !isUploading

  useEffect(() => {
    if (!open) return

    setTouched({})
    setSubmitted(false)

    if (editingExpense) {
      setDescription(editingExpense.description)
      setAmount(editingExpense.amount.toString())
      setPaidBy(editingExpense.paidBy)
      setSplitType(editingExpense.splitType)
      setAttachmentIds(editingExpense.attachments || [])
      setCategory(editingExpense.category || '')
      setCustomCategory('')

      if (editingExpense.category && !DEFAULT_CATEGORIES.includes(editingExpense.category)) {
        setCustomCategories((current) => (
          current.includes(editingExpense.category)
            ? current
            : [...current, editingExpense.category]
        ))
      }

      if (editingExpense.splitType === 'transfer') {
        const recipient = Object.entries(editingExpense.splits || {}).find(([, value]) => value > 0)?.[0] || ''
        setTransferTo(recipient)
      } else {
        setTransferTo('')
      }

      if (editingExpense.splitType === 'parts' && editingExpense.parts) {
        const values: Record<string, string> = {}
        Object.entries(editingExpense.parts).forEach(([id, value]) => {
          values[id] = value.toString()
        })
        setParts(values)
      } else {
        setParts({})
      }

      if (editingExpense.splitType === 'percentage' && editingExpense.percentages) {
        const values: Record<string, string> = {}
        Object.entries(editingExpense.percentages).forEach(([id, value]) => {
          values[id] = value.toString()
        })
        setPercentages(values)
      } else {
        setPercentages({})
      }

      if (editingExpense.splitType === 'exact' && editingExpense.splits) {
        const values: Record<string, string> = {}
        Object.entries(editingExpense.splits).forEach(([id, value]) => {
          values[id] = value.toString()
        })
        setExactAmounts(values)
      } else {
        setExactAmounts({})
      }

      if (editingExpense.splitType === 'shares' && editingExpense.splits) {
        const values: Record<string, string> = {}
        Object.entries(editingExpense.splits).forEach(([id, value]) => {
          values[id] = value.toString()
        })
        setShares(values)
      } else {
        setShares({})
      }

      if (editingExpense.splitType === 'unequal') {
        const includedMap = buildDefaultIncludedMap()
        Object.entries(editingExpense.splits || {}).forEach(([id, value]) => {
          includedMap[id] = value > 0
        })
        setIncluded(includedMap)
      } else {
        setIncluded(buildDefaultIncludedMap())
      }

      setShowAdvancedSplitOptions(isAdvancedSplitType(editingExpense.splitType) || editingExpense.splitType === 'transfer')
      return
    }

    setDescription('')
    setAmount('')
    setPaidBy(defaultPaidBy || members[0]?.id || '')
    setSplitType('equal')
    setTransferTo('')
    setAttachmentIds([])
    setParts({})
    setPercentages({})
    setExactAmounts({})
    setShares({})
    setIncluded(buildDefaultIncludedMap())
    setCategory('')
    setCustomCategory('')
    setShowAdvancedSplitOptions(false)
  }, [open, editingExpense, members, defaultPaidBy])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    setIsUploading(true)

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error('Only image files are supported for receipts.')
          continue
        }

        try {
          const filePath = await storeImage(file)
          if (filePath) {
            setAttachmentIds((prev) => [...prev, filePath])
          } else {
            toast.error('Failed to upload image.')
          }
        } catch (error) {
          console.error('Error uploading image:', error)
          toast.error('Failed to upload image. Please try again.')
        }
      }
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeAttachment = async (index: number) => {
    const imageId = attachmentIds[index]
    if (imageId) {
      await deleteImages([imageId])
    }
    setAttachmentIds((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)

    if (!canSubmit) return

    const splitData = computeSplitData(amountValue)
    if (splitData.error) return

    const finalCategory = resolvedCategory
    if (!finalCategory) return

    const resolvedPaidBy = paidBy || defaultPaidBy || members[0]?.id || ''
    if (!resolvedPaidBy) {
      toast.error('Could not resolve who paid for this expense.')
      return
    }

    if (category === 'custom' && !allCategories.includes(finalCategory)) {
      setCustomCategories((current) => [...current, finalCategory])
    }

    const expense: Expense = {
      id: editingExpense?.id || Date.now().toString(),
      description: description.trim(),
      amount: amountValue,
      paidBy: resolvedPaidBy,
      splitType: isPersonalWorkspace ? 'equal' : splitType,
      splits: splitData.splits,
      parts: splitData.partsData,
      percentages: splitData.percentagesData,
      date: editingExpense?.date || getISTTimestamp(),
      addedBy: currentUserId || editingExpense?.addedBy || resolvedPaidBy,
      attachments: attachmentIds,
      category: finalCategory,
    }

    onAdd(expense)

    setDescription('')
    setAmount('')
    setPaidBy(defaultPaidBy)
    setSplitType('equal')
    setTransferTo('')
    setAttachmentIds([])
    setParts({})
    setPercentages({})
    setExactAmounts({})
    setShares({})
    setIncluded(buildDefaultIncludedMap())
    setCategory('')
    setCustomCategory('')
    setTouched({})
    setSubmitted(false)
    setShowAdvancedSplitOptions(false)
    onOpenChange(false)
  }

  const previewTotal = splitPreview
    ? Object.values(splitPreview.splits).reduce((sum, value) => sum + value, 0)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-4 py-4 sm:px-6">
          <DialogTitle className="text-xl font-semibold">
            {editingExpense ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
          <DialogDescription>
            Add details once, split instantly, and keep the group in sync.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[min(74vh,760px)]">
          <form id="expense-form" onSubmit={handleSubmit} className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
            <section className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 shadow-sm">
              <Label htmlFor="amount" className="text-sm font-medium text-primary/90">
                Amount
              </Label>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold leading-none text-primary sm:text-3xl md:text-3xl">₹</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => markTouched('amount')}
                  className="h-auto min-h-[2.75rem] border-0 bg-transparent px-0 text-3xl font-semibold leading-none tracking-tight shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 sm:text-3xl md:text-3xl"
                />
              </div>
              {showError('amount') && amountError && (
                <p className="mt-2 text-xs text-destructive">{amountError}</p>
              )}
            </section>

            <section className="space-y-2">
              <Label htmlFor="description">Expense title</Label>
              <Input
                id="description"
                placeholder="e.g. Dinner at Green Bowl"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => markTouched('description')}
              />
              {showError('description') && descriptionError && (
                <p className="text-xs text-destructive">{descriptionError}</p>
              )}
            </section>

            <section className="space-y-3">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-2">
                {allCategories.map((cat) => {
                  const isSelected = category === cat
                  const dotColor = CATEGORY_DOT_COLORS[cat] || 'bg-slate-500'
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat)
                        markTouched('category')
                      }}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:bg-accent/40'
                      }`}
                      aria-pressed={isSelected}
                    >
                      <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
                      {cat}
                    </button>
                  )
                })}

                <button
                  type="button"
                  onClick={() => {
                    setCategory('custom')
                    markTouched('category')
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    category === 'custom'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-dashed border-border bg-background hover:bg-accent/40'
                  }`}
                  aria-pressed={category === 'custom'}
                >
                  + Custom
                </button>
              </div>

              <AnimatePresence initial={false}>
                {category === 'custom' && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-2"
                  >
                    <Input
                      id="custom-category"
                      placeholder="Type a custom category"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      onBlur={() => markTouched('category')}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {showError('category') && categoryError && (
                <p className="text-xs text-destructive">{categoryError}</p>
              )}
            </section>

            {!isPersonalWorkspace && (
              <section className="space-y-3">
                <Label>Paid by</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((member) => {
                    const isSelected = paidBy === member.id
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setPaidBy(member.id)
                          markTouched('paidBy')
                        }}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:bg-accent/40'
                        }`}
                        aria-pressed={isSelected}
                      >
                        <MemberAvatar member={member} size="sm" className="h-8 w-8" />
                        <span className="flex-1 truncate text-sm font-medium">{member.name}</span>
                        {isSelected && <span className="text-xs font-semibold text-primary">Selected</span>}
                      </button>
                    )
                  })}
                </div>
                {showError('paidBy') && paidByError && (
                  <p className="text-xs text-destructive">{paidByError}</p>
                )}
              </section>
            )}

            {!isPersonalWorkspace && (
              <section className="space-y-3 rounded-xl border border-border/60 bg-card/35 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">How to split</p>
                  <p className="text-xs text-muted-foreground">Most common options first</p>
                </div>
                <p className="text-xs text-muted-foreground">Default: Split equally</p>
              </div>

              <div role="radiogroup" aria-label="Split options" className="grid gap-2 sm:grid-cols-3">
                {MAIN_SPLIT_OPTIONS.map((option) => {
                  const isSelected = splitType === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSplitType(option.id)}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background hover:bg-accent/40'
                      }`}
                    >
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
                    </button>
                  )
                })}
              </div>

              <Collapsible open={showAdvancedSplitOptions} onOpenChange={setShowAdvancedSplitOptions}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="w-full justify-between px-2 text-sm">
                    More options
                    <CaretDown
                      className={`h-4 w-4 transition-transform ${showAdvancedSplitOptions ? 'rotate-180' : ''}`}
                      weight="bold"
                    />
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
                  <div role="radiogroup" aria-label="Advanced split options" className="grid gap-2 pt-2 sm:grid-cols-3">
                    {ADVANCED_SPLIT_OPTIONS.map((option) => {
                      const isSelected = splitType === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSplitType(option.id)}
                          className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-background hover:bg-accent/40'
                          }`}
                        >
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
                        </button>
                      )
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {splitType === 'transfer' && (
                <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                  <Label htmlFor="transfer-to">Who received?</Label>
                  <Select value={transferTo} onValueChange={setTransferTo}>
                    <SelectTrigger id="transfer-to">
                      <SelectValue placeholder="Select receiver" />
                    </SelectTrigger>
                    <SelectContent>
                      {members
                        .filter((member) => member.id !== paidBy)
                        .map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            <div className="flex items-center gap-2">
                              <MemberAvatar member={member} size="sm" className="h-6 w-6" />
                              {member.name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <AnimatePresence mode="wait" initial={false}>
                {splitType === 'unequal' && (
                  <motion.div
                    key="split-unequal"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-2 rounded-xl border border-border bg-background p-3"
                  >
                    <p className="text-xs text-muted-foreground">Select people to include in this split.</p>
                    {members.map((member) => (
                      <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-accent/40">
                        <Checkbox
                          checked={included[member.id] ?? true}
                          onCheckedChange={(checked) => {
                            setIncluded((prev) => ({ ...prev, [member.id]: checked === true }))
                          }}
                        />
                        <MemberAvatar member={member} size="sm" className="h-7 w-7" />
                        <span className="text-sm">{member.name}</span>
                      </label>
                    ))}
                  </motion.div>
                )}

                {splitType === 'percentage' && (
                  <motion.div
                    key="split-percentage"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-2 rounded-xl border border-border bg-background p-3"
                  >
                    <p className="text-xs text-muted-foreground">Set each person&apos;s share as a percentage.</p>
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center gap-2">
                        <MemberAvatar member={member} size="sm" className="h-7 w-7" />
                        <span className="flex-1 truncate text-sm">{member.name}</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            placeholder="0"
                            value={percentages[member.id] || ''}
                            onChange={(e) => setPercentages((prev) => ({ ...prev, [member.id]: e.target.value }))}
                            className="w-24"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                    ))}
                    <p className={`text-xs ${Math.abs(percentageTotal - 100) <= 0.01 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      Total: {percentageTotal.toFixed(1)}%
                    </p>
                  </motion.div>
                )}

                {splitType === 'exact' && (
                  <motion.div
                    key="split-exact"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-2 rounded-xl border border-border bg-background p-3"
                  >
                    <p className="text-xs text-muted-foreground">Enter exact amount for each member.</p>
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center gap-2">
                        <MemberAvatar member={member} size="sm" className="h-7 w-7" />
                        <span className="flex-1 truncate text-sm">{member.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={exactAmounts[member.id] || ''}
                            onChange={(e) => setExactAmounts((prev) => ({ ...prev, [member.id]: e.target.value }))}
                            className="w-28"
                          />
                        </div>
                      </div>
                    ))}
                    <p className={`text-xs ${Math.abs(exactTotal - amountValue) <= 0.01 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      Total: ₹{roundCurrency(exactTotal).toFixed(2)}
                    </p>
                  </motion.div>
                )}

                {splitType === 'parts' && (
                  <motion.div
                    key="split-parts"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-2 rounded-xl border border-border bg-background p-3"
                  >
                    <p className="text-xs text-muted-foreground">Use ratio values (for example: 2, 1, 1).</p>
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center gap-2">
                        <MemberAvatar member={member} size="sm" className="h-7 w-7" />
                        <span className="flex-1 truncate text-sm">{member.name}</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="0"
                          value={parts[member.id] || ''}
                          onChange={(e) => setParts((prev) => ({ ...prev, [member.id]: e.target.value }))}
                          className="w-24"
                        />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">Total ratio: {partsTotal.toFixed(1)}</p>
                  </motion.div>
                )}

                {splitType === 'shares' && (
                  <motion.div
                    key="split-shares"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-2 rounded-xl border border-border bg-background p-3"
                  >
                    <p className="text-xs text-muted-foreground">Use whole-number shares only.</p>
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center gap-2">
                        <MemberAvatar member={member} size="sm" className="h-7 w-7" />
                        <span className="flex-1 truncate text-sm">{member.name}</span>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={shares[member.id] || ''}
                          onChange={(e) => setShares((prev) => ({ ...prev, [member.id]: e.target.value }))}
                          className="w-24"
                        />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">Total shares: {sharesTotal}</p>
                  </motion.div>
                )}
              </AnimatePresence>

                {splitError && <p className="text-xs text-destructive">{splitError}</p>}
              </section>
            )}

            {!isPersonalWorkspace && (
              <section className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Split preview</p>
                  <p className="text-sm font-medium tabular-nums">₹{hasValidAmount ? amountValue.toFixed(2) : '0.00'}</p>
                </div>

                {!hasValidAmount && (
                  <p className="text-xs text-muted-foreground">Enter an amount to see each person&apos;s share.</p>
                )}

                {hasValidAmount && splitPreview && !splitPreview.error && (
                  <div className="space-y-2">
                    {members.map((member) => {
                      const shareAmount = splitPreview.splits[member.id] || 0
                      const isExcluded = splitType === 'unequal' && !(included[member.id] ?? true)
                      return (
                        <div key={member.id} className="flex items-center gap-2 rounded-lg bg-background/80 px-2 py-1.5">
                          <MemberAvatar member={member} size="sm" className="h-7 w-7" />
                          <span className="flex-1 truncate text-sm">{member.name}</span>
                          {isExcluded ? (
                            <span className="text-xs text-muted-foreground">Not included</span>
                          ) : (
                            <span className="text-sm font-semibold tabular-nums">₹{roundCurrency(shareAmount).toFixed(2)}</span>
                          )}
                        </div>
                      )
                    })}

                    <p className="pt-1 text-xs text-muted-foreground">
                      Preview total: ₹{roundCurrency(previewTotal).toFixed(2)}
                    </p>
                  </div>
                )}
              </section>
            )}

            {isPersonalWorkspace && (
              <section className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
                <p className="text-sm font-semibold text-foreground">Personal expense mode</p>
                <p className="text-xs text-muted-foreground">
                  This expense is tracked for your personal workspace only. No member splitting is applied.
                </p>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  Amount to track: ₹{hasValidAmount ? amountValue.toFixed(2) : '0.00'}
                </p>
              </section>
            )}

            <section className="space-y-2">
              <Label>Receipt (optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="expense-receipt-upload"
                disabled={isUploading}
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full justify-start gap-2 border-dashed"
                disabled={isUploading}
              >
                <ImageIcon className="h-4 w-4" />
                {isUploading ? 'Uploading receipt...' : 'Upload receipt image'}
              </Button>

              {displayAttachments.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {displayAttachments.map((attachment, index) => (
                    <div key={index} className="group relative overflow-hidden rounded-lg border border-border">
                      <img
                        src={attachment}
                        alt={`Receipt ${index + 1}`}
                        className="h-20 w-full object-cover"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => removeAttachment(index)}
                        className="absolute right-1 top-1 h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </form>
        </ScrollArea>

        <DialogFooter className="border-t border-border/60 bg-background/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-muted-foreground">
            {canSubmit ? 'Looks good. Ready to add.' : 'Complete required fields to continue.'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="expense-form" disabled={!canSubmit}>
              {editingExpense ? 'Update Expense' : 'Add Expense'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
