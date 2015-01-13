serenity partial response helper
===

Common module for serenity applications.

This module is designed to abstract the partial response support for serenity API's.

It is implemented based on google partial response [spec](https://developers.google.com/gdata/docs/2.0/reference#PartialResponse)

## How to install?

Install via npm and git

```
npm install git+https://github.com/riteshsangwan/serenity-partial-response-helper.git
```

## Configuration

This module has no specific configurations. Application using it have to make sure that they instantiate serenity-datasource module and pass it during this module initialization. If the datasource is invalid error would be thrown

Error conditions has to be handled by application.

## How to use?

```
var serenityResponseHelper = require('serenity-partial-response-helper');
var serenityDatasource = require('serenity-datasource');
// For serenity datasource configuration see serenity module docs
var config = require('config');
var datasource = new serenityDatasource(config);
var partialResponseHelper = new serenityResponseHelper(datasource);
```

The module exports two functions

- parseFields

  This module parse the request query parameters and make it available while reducing object to partial resonse
  This is added as an middleware to express application usally before any controller logic.
  
- reduceFieldsAndExpandObject

  This is also added as an middleware to express application usually just before sendnig the response to client
