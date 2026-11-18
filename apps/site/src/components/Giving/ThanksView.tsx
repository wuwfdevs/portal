import React from 'react'

import type { GivingContent } from '@/lib/giving/content'
import type { ThanksGift } from '@/lib/giving/thanks'
import { thanksText } from '@/lib/giving/thanks'
import { shown } from '@/lib/page-content'

import { ButtonLink, Hero, LinkCards, Section } from '../PageParts'
import { GivingShell, WithPhone } from './parts'

/**
 * The page a donor lands on after giving (board 14d). What it can say of the gift comes from the address the donation form sent them
 * back with, read strictly (`readThanks`); with none of it, it says thank you without claiming to know the amount. No ask, no form.
 */
export function ThanksView({ content, gift }: { content: GivingContent; gift: ThanksGift }) {
  const t = content.thanks
  const { title, body } = thanksText(
    { title: t?.title ?? '', titleNamed: t?.titleNamed ?? '', body: t?.body ?? '', bodyMonthly: t?.bodyMonthly ?? '', bodyOnce: t?.bodyOnce ?? '' },
    gift,
  )
  const steps = (t?.next ?? []).filter((s) => s.lead?.trim())
  const help = t?.helpLine?.trim() || null

  const aside = (steps.length > 0 || t?.promptTitle) && (
    <div className="flex flex-col gap-3.5 rounded-md border border-rule-strong bg-surface p-7">
      {t?.nextTitle && <strong className="text-[1.0625rem]">{t.nextTitle}</strong>}
      {steps.length > 0 && (
        <ol className="flex list-none flex-col gap-3 p-0 text-[0.9375rem] text-ink-2">
          {steps.map((s, i) => (
            <li className="flex gap-2.5" key={s.id ?? s.lead}>
              <strong aria-hidden="true" className="text-wuwf-blue-700">
                {i + 1}
              </strong>
              <span>
                <strong>{s.lead}</strong> {s.text}
              </span>
            </li>
          ))}
        </ol>
      )}
      {t?.promptTitle && (
        <div className="flex flex-col gap-1.5 border-t border-rule pt-3">
          <strong className="text-[0.9375rem]">{t.promptTitle}</strong>
          {t.promptLabel && t.promptHref && <ButtonLink className="min-h-11 self-start px-0 text-[0.9375rem]" href={t.promptHref} label={t.promptLabel} variant="outline" />}
        </div>
      )}
    </div>
  )

  return (
    <GivingShell content={content} current={null}>
      <Hero
        actions={
          <>
            <ButtonLink href={t?.primaryHref} label={t?.primaryLabel} />
            <ButtonLink href={t?.secondaryHref} label={t?.secondaryLabel} variant="outline" />
          </>
        }
        aside={aside || undefined}
        asideAlign="start"
        eyebrow={t?.eyebrow ?? ''}
        title={title}
        tone="lime"
      >
        {body && <p>{body}</p>}
      </Hero>

      {shown(t?.while) && (t.while.items?.length ?? 0) > 0 && (
        <Section eyebrow={t.while.eyebrow ?? undefined} title={t.while.title ?? ''}>
          <LinkCards className="lg:grid-cols-4" items={t.while.items} />
          {help && (
            <p className="text-sm text-ink-3">
              <WithPhone phone={content.phone} template={help} />
            </p>
          )}
        </Section>
      )}
    </GivingShell>
  )
}
