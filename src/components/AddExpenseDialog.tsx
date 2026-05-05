import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Image as ImageIcon, X } from '@phosphor-icons/react'
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
}

export default function AddExpenseDialog({ open, onOpenChange, onAdd, editingExpense, members, currentUserId }: AddExpenseDialogProps) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState<string>('')
  const [splitType, setSplitType] = useState<'equal' | 'parts' | 'custom' | 'percentage' | 'exact' | 'shares' | 'unequal' | 'transfer'>('equal')
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Separate IDs from URLs - URLs are public URLs from Supabase
  const imageIds = attachmentIds.filter(id => !id.startsWith('http'))
  const { images: attachmentImages } = useImages(imageIds.length > 0 ? imageIds : undefined)
  const displayAttachments = attachmentIds.map((attachmentId) => {
    if (attachmentId.startsWith('http')) return attachmentId
    const idx = imageIds.indexOf(attachmentId)
    return idx >= 0 ? (attachmentImages[idx] || attachmentId) : attachmentId
  })

  const allCategories = [...DEFAULT_CATEGORIES, ...(customCategories || [])]

  const defaultPaidBy = currentUserId && members.some((member) => member.id === currentUserId)
    ? currentUserId
    : ''

  useEffect(() => {
    if (!open) return

    if (editingExpense) {
      setDescription(editingExpense.description)
      setAmount(editingExpense.amount.toString())
      setPaidBy(editingExpense.paidBy)
      setSplitType(editingExpense.splitType)
      if (editingExpense.splitType === 'transfer') {
        const recipient = Object.entries(editingExpense.splits || {}).find(([, value]) => value > 0)?.[0] || ''
        setTransferTo(recipient)
      } else {
        setTransferTo('')
      }
      setAttachmentIds(editingExpense.attachments || [])
      setCategory(editingExpense.category || '')
      setCustomCategory('')
      
      if (editingExpense.splitType === 'parts' && editingExpense.parts) {
        const partsStrings: Record<string, string> = {}
        Object.entries(editingExpense.parts).forEach(([id, value]) => {
          partsStrings[id] = value.toString()
        })
        setParts(partsStrings)
      } else {
        setParts({})
      }
      
      if (editingExpense.splitType === 'percentage' && editingExpense.percentages) {
        const percentStrings: Record<string, string> = {}
        Object.entries(editingExpense.percentages).forEach(([id, value]) => {
          percentStrings[id] = value.toString()
        })
        setPercentages(percentStrings)
      } else {
        setPercentages({})
      }
      
      if ((editingExpense.splitType === 'exact' || editingExpense.splitType === 'shares') && editingExpense.splits) {
        const splitStrings: Record<string, string> = {}
        Object.entries(editingExpense.splits).forEach(([id, value]) => {
          splitStrings[id] = value.toString()
        })
        if (editingExpense.splitType === 'exact') {
          setExactAmounts(splitStrings)
        } else {
          setShares(splitStrings)
        }
      } else {
        setExactAmounts({})
        setShares({})
      }
      
      if (editingExpense.splitType === 'unequal' && editingExpense.splits) {
        const includedMap: Record<string, boolean> = {}
        Object.keys(editingExpense.splits).forEach(id => {
          includedMap[id] = editingExpense.splits[id] > 0
        })
        setIncluded(includedMap)
      } else {
        const defaultIncluded: Record<string, boolean> = {}
        members.forEach(m => { defaultIncluded[m.id] = true })
        setIncluded(defaultIncluded)
      }
    } else {
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
      const defaultIncluded: Record<string, boolean> = {}
      members.forEach(m => { defaultIncluded[m.id] = true })
      setIncluded(defaultIncluded)
      setCategory('')
      setCustomCategory('')
    }
  }, [open, editingExpense, defaultPaidBy, members])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    setIsUploading(true)

    try {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          try {
            const filePath = await storeImage(file)
            if (filePath) {
              setAttachmentIds(prev => [...prev, filePath])
            } else {
              toast.error('Failed to upload image')
            }
          } catch (error) {
            console.error('Error uploading image:', error)
            toast.error('Failed to upload image. Make sure the storage bucket exists.')
          }
        } else {
          toast.error('Only image files are allowed')
        }
      }
    } catch (error) {
      toast.error('Failed to upload images')
      console.error(error)
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
    setAttachmentIds(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!description.trim()) {
      toast.error('Please enter a description')
      return
    }

    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (!paidBy) {
      toast.error('Please select who paid')
      return
    }

    let finalCategory = category
    if (category === 'custom') {
      if (!customCategory.trim()) {
        toast.error('Please enter a custom category name')
        return
      }
      finalCategory = customCategory.trim()
      if (!allCategories.includes(finalCategory)) {
        setCustomCategories((current) => [...(current || []), finalCategory])
      }
    }

    if (!finalCategory) {
      finalCategory = splitType === 'transfer' ? 'Transfer' : ''
    }
    if (!finalCategory) {
      toast.error('Please select a category')
      return
    }

    const splits: Record<string, number> = {}
    let partsData: Record<string, number> | undefined = undefined
    let percentagesData: Record<string, number> | undefined = undefined

    if (splitType === 'transfer') {
      if (!transferTo) {
        toast.error('Select who received the transfer')
        return
      }
      if (transferTo === paidBy) {
        toast.error('Sender and receiver must be different')
        return
      }
      splits[transferTo] = amountNum
    } else if (splitType === 'equal') {
      const splitAmount = amountNum / members.length
      members.forEach(member => {
        splits[member.id] = splitAmount
      })
    } else if (splitType === 'parts') {
      const partsNumbers: Record<string, number> = {}
      let totalParts = 0
      let hasError = false

      members.forEach(member => {
        const partValue = parseFloat(parts[member.id] || '0')
        if (isNaN(partValue) || partValue < 0) {
          toast.error(`Invalid part value for ${member.name}`)
          hasError = true
          return
        }
        partsNumbers[member.id] = partValue
        totalParts += partValue
      })

      if (hasError) return

      if (totalParts === 0) {
        toast.error('Total parts must be greater than 0')
        return
      }

      members.forEach(member => {
        splits[member.id] = (partsNumbers[member.id] / totalParts) * amountNum
      })

      partsData = partsNumbers
    } else if (splitType === 'percentage') {
      const percentNumbers: Record<string, number> = {}
      let totalPercent = 0
      let hasError = false

      members.forEach(member => {
        const percentValue = parseFloat(percentages[member.id] || '0')
        if (isNaN(percentValue) || percentValue < 0 || percentValue > 100) {
          toast.error(`Invalid percentage for ${member.name} (must be 0-100)`)
          hasError = true
          return
        }
        percentNumbers[member.id] = percentValue
        totalPercent += percentValue
      })

      if (hasError) return

      if (Math.abs(totalPercent - 100) > 0.01) {
        toast.error(`Total percentage must equal 100% (currently ${totalPercent.toFixed(2)}%)`)
        return
      }

      members.forEach(member => {
        splits[member.id] = (percentNumbers[member.id] / 100) * amountNum
      })

      percentagesData = percentNumbers
    } else if (splitType === 'exact') {
      let totalExact = 0
      let hasError = false

      members.forEach(member => {
        const exactValue = parseFloat(exactAmounts[member.id] || '0')
        if (isNaN(exactValue) || exactValue < 0) {
          toast.error(`Invalid amount for ${member.name}`)
          hasError = true
          return
        }
        splits[member.id] = exactValue
        totalExact += exactValue
      })

      if (hasError) return

      if (Math.abs(totalExact - amountNum) > 0.01) {
        toast.error(`Total split amounts (₹${totalExact.toFixed(2)}) must equal expense amount (₹${amountNum.toFixed(2)})`)
        return
      }
    } else if (splitType === 'shares') {
      const shareNumbers: Record<string, number> = {}
      let totalShares = 0
      let hasError = false

      members.forEach(member => {
        const shareValue = parseInt(shares[member.id] || '0')
        if (isNaN(shareValue) || shareValue < 0) {
          toast.error(`Invalid share value for ${member.name}`)
          hasError = true
          return
        }
        shareNumbers[member.id] = shareValue
        totalShares += shareValue
      })

      if (hasError) return

      if (totalShares === 0) {
        toast.error('Total shares must be greater than 0')
        return
      }

      members.forEach(member => {
        splits[member.id] = (shareNumbers[member.id] / totalShares) * amountNum
      })

      partsData = shareNumbers
    } else if (splitType === 'unequal') {
      const includedMembers = members.filter(m => included[m.id])
      
      if (includedMembers.length === 0) {
        toast.error('At least one person must be included in the split')
        return
      }

      const splitAmount = amountNum / includedMembers.length
      members.forEach(member => {
        splits[member.id] = included[member.id] ? splitAmount : 0
      })
    }

    const expense: Expense = {
      id: editingExpense?.id || Date.now().toString(),
      description: description.trim(),
      amount: amountNum,
      paidBy,
      splitType,
      splits,
      parts: partsData,
      percentages: percentagesData,
      date: editingExpense?.date || getISTTimestamp(),
      addedBy: currentUserId || editingExpense?.addedBy || paidBy,
      attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
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
    setCategory('')
    setCustomCategory('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {editingExpense ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
          <DialogDescription>
            {editingExpense ? 'Update expense details and split information' : 'Add a new expense and choose how to split it'}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
          <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="e.g., Hotel booking, Fuel, Breakfast"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
                <SelectItem value="custom">+ Custom Category</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {category === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="custom-category">Custom Category Name</Label>
              <Input
                id="custom-category"
                placeholder="Enter category name"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="paid-by">Who paid?</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger id="paid-by">
                <SelectValue placeholder="Select person" />
              </SelectTrigger>
              <SelectContent>
                {members.map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6">
                        <MemberAvatar member={member} size="sm" className="h-6 w-6" />
                      </div>
                      {member.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Split type</Label>
            <RadioGroup value={splitType} onValueChange={(value) => setSplitType(value as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="equal" id="equal" />
                <Label htmlFor="equal" className="font-normal cursor-pointer">
                  Split equally among all
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unequal" id="unequal" />
                <Label htmlFor="unequal" className="font-normal cursor-pointer">
                  Split equally among selected people
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percentage" id="percentage" />
                <Label htmlFor="percentage" className="font-normal cursor-pointer">
                  Split by percentage
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="exact" id="exact" />
                <Label htmlFor="exact" className="font-normal cursor-pointer">
                  Specify exact amounts
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="parts" id="parts" />
                <Label htmlFor="parts" className="font-normal cursor-pointer">
                  Split by parts/ratio
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="shares" id="shares" />
                <Label htmlFor="shares" className="font-normal cursor-pointer">
                  Split by shares (whole numbers)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {splitType === 'transfer' && (
            <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
              <Label className="text-sm font-semibold">Transfer details</Label>
              <p className="text-xs text-muted-foreground">
                Record a repayment between two people. The sender is set in "Who paid?" and the receiver here gets the full amount.
              </p>
              <div className="space-y-2">
                <Label htmlFor="transfer-to">Who received?</Label>
                <Select value={transferTo} onValueChange={setTransferTo}>
                  <SelectTrigger id="transfer-to">
                    <SelectValue placeholder="Select receiver" />
                  </SelectTrigger>
                  <SelectContent>
                    {members
                      .filter(member => !paidBy || member.id !== paidBy)
                      .map(member => (
                        <SelectItem key={member.id} value={member.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6">
                              <MemberAvatar member={member} size="sm" className="h-6 w-6" />
                            </div>
                            {member.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {splitType === 'unequal' && (
            <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
              <Label className="text-sm font-semibold">Select people to include in split</Label>
              <p className="text-xs text-muted-foreground">
                Amount will be split equally among selected people
              </p>
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`include-${member.id}`}
                    checked={included[member.id] ?? true}
                    onChange={(e) => setIncluded(prev => ({ ...prev, [member.id]: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <MemberAvatar member={member} size="sm" />
                  <Label htmlFor={`include-${member.id}`} className="text-sm cursor-pointer flex-1">
                    {member.name}
                  </Label>
                </div>
              ))}
            </div>
          )}

          {splitType === 'percentage' && (
            <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
              <Label className="text-sm font-semibold">Enter percentage for each person</Label>
              <p className="text-xs text-muted-foreground">
                Total must equal 100%. Current total: {Object.values(percentages).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toFixed(1)}%
              </p>
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3">
                  <MemberAvatar member={member} size="sm" />
                  <div className="flex-1">
                    <Label htmlFor={`percent-${member.id}`} className="text-sm">
                      {member.name}
                    </Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      id={`percent-${member.id}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="0"
                      value={percentages[member.id] || ''}
                      onChange={(e) => setPercentages(prev => ({ ...prev, [member.id]: e.target.value }))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {splitType === 'exact' && (
            <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
              <Label className="text-sm font-semibold">Enter exact amount for each person</Label>
              <p className="text-xs text-muted-foreground">
                Total must equal ₹{amount || '0'}. Current total: ₹{Object.values(exactAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toFixed(2)}
              </p>
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3">
                  <MemberAvatar member={member} size="sm" />
                  <div className="flex-1">
                    <Label htmlFor={`exact-${member.id}`} className="text-sm">
                      {member.name}
                    </Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">₹</span>
                    <Input
                      id={`exact-${member.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={exactAmounts[member.id] || ''}
                      onChange={(e) => setExactAmounts(prev => ({ ...prev, [member.id]: e.target.value }))}
                      className="w-24"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {splitType === 'parts' && (
            <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
              <Label className="text-sm font-semibold">Enter parts for each person</Label>
              <p className="text-xs text-muted-foreground">
                Each person's share will be calculated as: (their parts / total parts) × total amount
              </p>
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3">
                  <MemberAvatar member={member} size="sm" />
                  <div className="flex-1">
                    <Label htmlFor={`part-${member.id}`} className="text-sm">
                      {member.name}
                    </Label>
                  </div>
                  <Input
                    id={`part-${member.id}`}
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={parts[member.id] || ''}
                    onChange={(e) => setParts(prev => ({ ...prev, [member.id]: e.target.value }))}
                    className="w-24"
                  />
                </div>
              ))}
              {Object.values(parts).some(v => v) && (
                <div className="text-sm text-muted-foreground pt-2 border-t">
                  Total parts: {Object.values(parts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0).toFixed(1)}
                </div>
              )}
            </div>
          )}

          {splitType === 'shares' && (
            <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
              <Label className="text-sm font-semibold">Enter shares for each person</Label>
              <p className="text-xs text-muted-foreground">
                Each person's share will be calculated as: (their shares / total shares) × total amount. Use whole numbers only.
              </p>
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3">
                  <MemberAvatar member={member} size="sm" />
                  <div className="flex-1">
                    <Label htmlFor={`share-${member.id}`} className="text-sm">
                      {member.name}
                    </Label>
                  </div>
                  <Input
                    id={`share-${member.id}`}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={shares[member.id] || ''}
                    onChange={(e) => setShares(prev => ({ ...prev, [member.id]: e.target.value }))}
                    className="w-24"
                  />
                </div>
              ))}
              {Object.values(shares).some(v => v) && (
                <div className="text-sm text-muted-foreground pt-2 border-t">
                  Total shares: {Object.values(shares).reduce((sum, v) => sum + (parseInt(v) || 0), 0)}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Attachments</Label>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                disabled={isUploading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full gap-2"
                disabled={isUploading}
              >
                <ImageIcon className="h-4 w-4" />
                {isUploading ? 'Uploading...' : 'Upload Photos'}
              </Button>
              {displayAttachments.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {displayAttachments.map((attachment, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={attachment}
                        alt={`Attachment ${index + 1}`}
                        className="w-full h-20 object-cover rounded-md border border-border"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => removeAttachment(index)}
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
        </ScrollArea>
        
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form">
            {editingExpense ? 'Update' : 'Add'} Expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
