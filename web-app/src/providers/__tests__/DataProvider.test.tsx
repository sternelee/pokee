import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataProvider } from '../DataProvider'
import { RouterProvider, createRouter, createRootRoute, createMemoryHistory } from '@tanstack/react-router'

// Mock Tauri deep link
vi.mock('@tauri-apps/plugin-deep-link', () => ({
  onOpenUrl: vi.fn(),
  getCurrent: vi.fn().mockResolvedValue([]),
}))

// The services are handled by the global ServiceHub mock in test setup

// Mock hooks
vi.mock('@/hooks/useThreads', () => ({
  useThreads: vi.fn(() => ({
    setThreads: vi.fn(),
  })),
}))

vi.mock('@/hooks/useModelProvider', () => ({
  useModelProvider: vi.fn(() => ({
    setProviders: vi.fn(),
  })),
}))

vi.mock('@/hooks/useAssistant', () => ({
  useAssistant: vi.fn(() => ({
    setAssistants: vi.fn(),
  })),
}))

vi.mock('@/hooks/useMessages', () => ({
  useMessages: vi.fn(() => ({
    setMessages: vi.fn(),
  })),
}))

vi.mock('@/hooks/useAppUpdater', () => ({
  useAppUpdater: vi.fn(() => ({
    checkForUpdate: vi.fn(),
  })),
}))

vi.mock('@/hooks/useMCPServers', () => ({
  useMCPServers: vi.fn(() => ({
    setServers: vi.fn(),
  })),
}))

describe('DataProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderWithRouter = (children: React.ReactNode) => {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <DataProvider />
          {children}
        </>
      ),
    })

    const router = createRouter({ 
      routeTree: rootRoute,
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
    })
    return render(<RouterProvider router={router} />)
  }

  it('renders without crashing', () => {
    renderWithRouter(<div>Test Child</div>)
    
    expect(screen.getByText('Test Child')).toBeInTheDocument()
  })

  it('initializes data on mount', async () => {
    // DataProvider initializes and renders children without errors
    renderWithRouter(<div>Test Child</div>)
    
    await waitFor(() => {
      expect(screen.getByText('Test Child')).toBeInTheDocument()
    })
  })

  it('handles multiple children correctly', () => {
    const TestComponent1 = () => <div>Test Child 1</div>
    const TestComponent2 = () => <div>Test Child 2</div>
    
    renderWithRouter(
      <>
        <TestComponent1 />
        <TestComponent2 />
      </>
    )
    
    expect(screen.getByText('Test Child 1')).toBeInTheDocument()
    expect(screen.getByText('Test Child 2')).toBeInTheDocument()
  })
})