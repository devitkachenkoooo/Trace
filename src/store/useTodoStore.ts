import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

interface TodoState {
  todos: Todo[];
  addTodo: (text: string) => void;
  toggleTodo: (id: number) => void;
  deleteTodo: (id: number) => void;
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set) => ({
      todos: [
        { id: 1, text: 'Налаштувати Docker проект', completed: true },
        { id: 2, text: 'Підключити Tailwind 4', completed: true },
        { id: 3, text: 'Створити круту анімацію', completed: false },
      ],
      addTodo: (text: string) =>
        set((state) => ({
          todos: [...state.todos, { id: Date.now(), text, completed: false }],
        })),
      toggleTodo: (id: number) =>
        set((state) => ({
          todos: state.todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
        })),
      deleteTodo: (id: number) =>
        set((state) => ({
          todos: state.todos.filter((t) => t.id !== id),
        })),
    }),
    {
      name: 'trace-storage',
      skipHydration: true,
    },
  ),
);
