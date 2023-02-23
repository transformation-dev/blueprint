import { describe, it, expect } from 'vitest'

import { throwIfNotDag } from '../src/throws.js'

describe('throwIfNotDag', () => {
  it('should not throw on DAG with repeated leaf nodes', () => {
    const dagNode = {
      id: 'DAGNode',
      children: [
        {
          id: 'DAGNode.1',
        },
      ],
    }

    const dag = {
      id: 'companyID',
      children: [
        {
          id: 'node1',
          children: [
            {
              id: 'node1.1',
              children: [
                {
                  id: 'node1.1.1',
                  children: [
                    {
                      id: 'node1.1.1.1',
                      label: 'Node 1.1.1.1',
                    },
                  ],
                },
                {
                  id: 'node1.1.2',
                  children: [],  // Intentionally has children but empty to test
                },
                dagNode,
              ],
            },
            {
              id: 'node1.2',
              children: [],
            },
            dagNode,
          ],
        },
        {
          id: 'node2',
        },
        {
          id: 'node3',  // Intentionally missing children to test
        },
        {
          id: 'node4',
        },
      ],
    }

    const result = throwIfNotDag(dag)
    expect(result).toBe(true)
  })

  it('should not throw on diamond shaped DAG with children two levels below diamond', () => {
    const branch = {
      idString: '10',
      children: [
        {
          idString: '20',
        },
      ],
    }

    const dag = {
      idString: '1',
      children: [
        {
          idString: '2',
          children: [
            branch,
          ],
        },
        {
          idString: '3',
          children: [
            branch,
          ],
        },
      ],
    }
    const result = throwIfNotDag(dag)
    expect(result).toBe(true)
  })

  it('should throw if children is a Set', () => {
    const dag = {
      id: 'companyID',
      children: new Set([
        {
          id: '1',
        },
      ]),
    }

    expect(() => throwIfNotDag(dag)).toThrowError('must be an Array')
  })

  it('should throw if no id or idString', () => {
    const dag = {
      ID: 'companyID',
    }

    expect(() => throwIfNotDag(dag)).toThrowError('must have an id or idString')
  })

  it('should throw if no id is not a string', () => {
    const dag = {
      id: 10,
    }

    expect(() => throwIfNotDag(dag)).toThrowError('that is a string')
  })

  it('should throw if node is a child of itself', () => {
    const dag = {
      id: 'companyID',
      children: [
        {
          id: '1',
          children: [
            {
              id: '1',
            },
          ],
        },
      ],
    }

    expect(() => throwIfNotDag(dag)).toThrowError('contains duplicate ids')
  })

  it('should throw if a duplicate node is a two levels down', () => {
    const dag = {
      id: '1',
      children: [
        {
          id: '2',
          children: [
            {
              id: '1',
            },
          ],
        },
      ],
    }

    expect(() => throwIfNotDag(dag)).toThrowError('contains duplicate ids')
  })

  it('should throw if there are duplicate siblings', () => {
    const dag = {
      id: '1',
      children: [
        {
          id: '2',
        },
        {
          id: '2',
        },
      ],
    }

    expect(() => throwIfNotDag(dag)).toThrowError('contain duplicate ids')
  })
})
