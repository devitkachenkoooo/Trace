'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTodoStore } from '@/store/useTodoStore';

export default function TodoPage() {
  const { todos, addTodo, toggleTodo, deleteTodo } = useTodoStore();
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    useTodoStore.persist.rehydrate();
  }, []);

  const handleAddTodo = () => {
    if (inputValue.trim()) {
      addTodo(inputValue);
      setInputValue('');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] p-4 text-zinc-100">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl"
      >
        <div className="p-8">
          <h1 className="text-3xl font-black tracking-tighter text-white mb-6 bg-gradient-to-r from-blue-500 to-emerald-400 bg-clip-text text-transparent">
            TRACE TASKS
          </h1>

          {/* Поле вводу */}
          <div className="flex gap-2 mb-8">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
              placeholder="Що плануєш зробити?"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all placeholder:text-zinc-600"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAddTodo}
              className="bg-blue-600 p-3 rounded-2xl hover:bg-blue-500 transition-colors"
            >
              <Plus size={24} />
            </motion.button>
          </div>

          {/* Список задач */}
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {todos.map((todo) => (
                <motion.div
                  key={todo.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className={`group flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    todo.completed
                      ? 'bg-zinc-950/50 border-zinc-900 opacity-60'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    className="flex items-center gap-3 flex-1 text-left w-full focus:outline-none"
                    onClick={() => toggleTodo(todo.id)}
                  >
                    {todo.completed ? (
                      <CheckCircle2 className="text-emerald-500" size={20} />
                    ) : (
                      <Circle
                        className="text-zinc-600 group-hover:text-blue-500 transition-colors"
                        size={20}
                      />
                    )}
                    <span
                      className={`text-sm font-medium ${todo.completed ? 'line-through text-zinc-500' : 'text-zinc-200'}`}
                    >
                      {todo.text}
                    </span>
                  </button>

                  <motion.button
                    whileHover={{ color: '#ef4444' }}
                    onClick={() => deleteTodo(todo.id)}
                    className="text-zinc-600 p-1"
                  >
                    <Trash2 size={18} />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="bg-zinc-950/50 p-4 border-t border-zinc-800 text-center">
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold">
            Project Trace • React 19 • Framer Motion
          </p>
        </div>
      </motion.div>
    </main>
  );
}
