import Image from 'next/image'
import React from 'react'

import { cn } from '@/utilities/ui'

/** The WUWF 88.1 wordmark. The file is 450×190; it is shown at the header's height. */
export const Logo: React.FC<{ className?: string; priority?: boolean }> = ({ className, priority }) => (
  <Image
    alt="WUWF 88.1"
    className={cn('h-9 w-auto', className)}
    height={190}
    priority={priority}
    quality={100}
    src="/wuwf-logo.png"
    width={450}
  />
)
