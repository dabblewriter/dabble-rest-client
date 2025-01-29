A library for working with JSON REST APIs. This function creates a REST API client that can be used to make requests to the specified URL. It returns an object with methods for making GET, POST, PUT, PATCH, and DELETE requests.

Examples:

 ```ts
 const api = createRestAPI('https://api.example.com');
 const data = await api.get('/users').send();
 const user = await api.post('/users').body({ name: 'Alice' }).send();
 const user = await api.post('/users').send({ name: 'Alice' });
 await api.delete('/users').query({ id: 123 }).send();
 ```
