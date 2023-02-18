import test from 'tape'
import { throwIfNotDag } from '../src/throws.js'

test('throwIfNotDag should not throw', (t) => {
  t.doesNotThrow(
    () => {
      const dagNode = {
        id: 'DAGNode',
        children: new Set([
          {
            id: 'DAGNode.1',
          },
        ]),
      }
      const dag = {
        id: 'companyID',
        children: new Set([
          {
            id: 'node1',
            children: new Set([
              {
                id: 'node1.1',
                children: new Set([
                  {
                    id: 'node1.1.1',
                    children: new Set([
                      {
                        id: 'node1.1.1.1',
                        label: 'Node 1.1.1.1',
                      },
                    ]),
                  },
                  {
                    id: 'node1.1.2',
                    children: new Set(),  // Intentionally has children but empty to test
                  },
                  dagNode,
                ]),
              },
              {
                id: 'node1.2',
                children: new Set(),
              },
              dagNode,
            ]),
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
        ]),
      }
      throwIfNotDag(dag)
    },
    'DAG with repeated leaf nodes',
  )

  t.doesNotThrow(
    () => {
      const branch = {
        id: '10',
        children: new Set([
          {
            id: '20',
          },
        ]),
      }

      const dag = {
        id: '1',
        children: new Set([
          {
            id: '2',
            children: new Set([
              branch,
            ]),
          },
          {
            id: '3',
            children: new Set([
              branch,
            ]),
          },
        ]),
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
        children: new Set([
          {
            id: '1',
            children: new Set([
              {
                id: '1',
              },
            ]),
          },
        ]),
      }
      throwIfNotDag(dag)
    },
    'node is a child of itself',
  )

  t.throws(
    () => {
      const dag = {
        id: '1',
        children: new Set([
          {
            id: '2',
            children: new Set([
              {
                id: '1',
              },
            ]),
          },
        ]),
      }
      throwIfNotDag(dag)
    },
    'duplicate node is a two levels down',
  )

  t.throws(
    () => {
      const dag = {
        id: '1',
        children: new Set([
          {
            id: '2',
          },
          {
            id: '2',
          },
        ]),
      }
      throwIfNotDag(dag)
    },
    'duplicate siblings',
  )

  t.end()
})
