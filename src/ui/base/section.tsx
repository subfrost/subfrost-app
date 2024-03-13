import { ReactNode } from 'react'

type ISection = {
  bg?: `bg-${string}`
  children: ReactNode
  id?: string
  className?: string
  title?: string
}

export const Section = ({ bg, children, id, className, title }: ISection) => {
  return (
    <div className={bg} id={id}>
      <div className={`max-w-7xl mx-auto ${className ?? 'px-6'}`}>
        {title ? <h3 className="text-xl mb-6">{title}</h3> : null}
        {children}
      </div>
    </div>
  )
}
