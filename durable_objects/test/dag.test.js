import test from 'tape'
import { throwIfNotDag } from '../src/utils.js'

test('throwIfNotDag should not throw', (t) => {
  t.doesNotThrow(
    () => {
      const dagNode = { id: 'DAGNode', label: 'DAG Node' }
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
            children: [],
          },
          {
            id: 'node3',  // Intentionally missing children to test
          },
          {
            id: 'node4',
            children: [],
          },
        ],
      }
      throwIfNotDag(dag)
    },
    'DAG with repeated leaf nodes',
  )

  t.doesNotThrow(
    () => {
      const branch = {
        id: '10',
        children: [
          {
            id: '20',
          },
        ],
      }
      const dag = {
        id: '1',
        children: [
          {
            id: '2',
            children: [
              branch,
            ],
          },
          {
            id: '3',
            children: [
              branch,
            ],
          },
        ],
      }
      throwIfNotDag(dag)
    },
    'diamond shaped DAG with children two levels below diamond',
  )

  t.end()
})

test('throwIfNotDag should throw', (t) => {
  t.throws(
    () => {
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
      throwIfNotDag(dag)
    },
    'node is a child of itself',
  )

  t.throws(
    () => {
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
      throwIfNotDag(dag)
    },
    'duplicate node is a two levels down',
  )

  t.throws(
    () => {
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
      throwIfNotDag(dag)
    },
    'duplicate siblings',
  )

  t.end()
})
