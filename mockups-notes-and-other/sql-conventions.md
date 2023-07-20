# SQL conventions

## Naming

- Use lowercase for SQL keywords trusting highlighting to make them stand out
- Use camelCase for column names
- Use PascalCase for table names
- Use singular nouns for table names
- Use 'nameIsoString' for date-time columns

## Keys

- Use 'id' as primary key
- Use '_id' for foriegn keys (e.g. 'TableName_id' or 'TableName.relationshipName_id')
- Use underscore for foriegn key references to fields other than 'id' (e.g. 'TableName_someField')

## Aliasing

- Aliases should be the first letter of each word in the name of the thing being aliased
- If there is already a correlation with the same name then append a number
- For computed data (sum(), avg(), etc.) use the name you would give it were it a column defined in the schema

## Formatting

- Use 2 spaces for indentation
- Use 1 space after commas
- Use 1 space before and after operators
- Right-justify SELECT, FROM, JOIN, ON, WHERE, and other primary SQL keywords
  
## Example

```sql
  select firstName as fn
    from Staff as s1
    join Students as s2
      on s2.mentorId = s1.id;

  select sum(s.monitorTally) as monitorTotal
    from staff as s;
```
