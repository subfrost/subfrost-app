import { ReactNode } from "react";

type IButton = {
  onClick?: () => void;
  children: ReactNode;
}

export const Button = ({ onClick, children }: IButton) => {
  return (
    <button onClick={onClick}             className='px-4 py-2 hover:bg-[#bdedfa] rounded-sm cursor-pointer duration-150 hover:text-black'>
      {children}
    </button>
  )
}