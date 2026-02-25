# List Matches

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /tournaments/{tournament_id}/matches.json:
    get:
      summary: List Matches
      deprecated: false
      description: Returns matches based on the tournament ID given
      operationId: findMatches
      tags:
        - API v2.1/Tournament API/Matches
        - Match
      parameters:
        - name: tournament_id
          in: path
          description: ID (recommended) or URL of the Tournament
          required: true
          example: ''
          schema:
            type: string
        - name: community_id
          in: query
          description: >-
            If the tournament belongs to a community, you **must** include the
            community's subdomain or permalink as this parameter for proper
            scoping. You can alternatively prefix the endpoint with
            `/v2.1/communities/{community_id}/`
          required: false
          schema:
            type: string
        - name: page
          in: query
          description: Number of the page
          required: false
          schema:
            type: integer
            format: string
            default: '1'
        - name: per_page
          in: query
          description: Number of collection members per page
          required: false
          schema:
            type: integer
            format: string
            default: '25'
        - name: state
          in: query
          description: State of the Matches
          required: false
          schema:
            type: string
            format: string
            enum:
              - pending
              - open
              - complete
        - name: participant_id
          in: query
          description: Filter matches by Participant Id
          required: false
          schema:
            type: string
            format: string
        - name: Content-Type
          in: header
          description: Default value for `Content-Type` header
          required: true
          example: ''
          schema:
            type: string
            default: application/vnd.api+json
        - name: Accept
          in: header
          description: Default value for `Accept` header
          required: true
          example: ''
          schema:
            type: string
            default: application/json
        - name: Authorization-Type
          in: header
          description: >-
            Default value for `Authorization-Type` header. If you want to use
            APIv2's oAuth2 authentication method, use, change this to `v2`
          required: true
          example: ''
          schema:
            type: string
            default: v1
        - name: If-None-Match
          in: header
          description: Used as caching key for future response
          required: false
          example: ''
          schema:
            type: string
      responses:
        '200':
          description: Tournament Matches Response
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/MatchModel'
          headers: {}
          x-apidog-name: OK
        '401':
          description: 401 Unauthorized
          content:
            application/json:
              schema:
                type: array
                items: &ref_0
                  $ref: '#/components/schemas/ErrorModel'
          headers: {}
          x-apidog-name: Unauthorized
        '406':
          description: 406 Not Acceptable
          content:
            application/json:
              schema:
                type: array
                items: *ref_0
          headers: {}
          x-apidog-name: Not Acceptable
        '415':
          description: 415 Unsupported Media Type
          content:
            application/json:
              schema:
                type: array
                items: *ref_0
          headers: {}
          x-apidog-name: Unsupported Media Type
      security:
        - api_key: []
          x-apidog:
            schemeGroups:
              - id: xVxvsn1TQsHpWORdaMdwr
                schemeIds:
                  - api_key
              - id: bdHCUCde0yqdiIjpyn2Z-
                schemeIds:
                  - challonge_oauth
            required: true
            use:
              id: xVxvsn1TQsHpWORdaMdwr
            scopes:
              bdHCUCde0yqdiIjpyn2Z-:
                challonge_oauth: []
      x-apidog-folder: API v2.1/Tournament API/Matches
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1113893/apis/api-23619745-run
components:
  schemas:
    MatchModel:
      properties:
        id:
          type: string
          default: '8008135'
        type:
          type: string
          default: match
        attributes:
          $ref: '#/components/schemas/MatchOutput'
      x-apidog-orders:
        - id
        - type
        - attributes
      type: object
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
    MatchOutput:
      properties:
        state:
          type: string
          enum:
            - pending
            - open
            - complete
          default: complete
        round:
          type: integer
          default: 1
        identifier:
          type: string
          default: A
        suggested_play_order:
          type: integer
          default: 1
        scores:
          type: string
          default: 2 - 0
        score_in_sets:
          type: object
          default:
            - - 3
              - 1
            - - 4
              - 2
          x-apidog-orders: []
          properties: {}
          x-apidog-ignore-properties: []
        points_by_participant:
          type: object
          default:
            - participant_id: 355
              scores:
                - 3
                - 4
            - participant_id: 354
              scores:
                - 1
                - 2
          x-apidog-orders: []
          properties: {}
          x-apidog-ignore-properties: []
        timestamps:
          properties:
            created_at:
              type: string
              default: '2023-04-21T14:29:06.374Z'
            updated_at:
              type: string
          x-apidog-orders:
            - created_at
            - updated_at
          type: object
          x-apidog-ignore-properties: []
        winner_id:
          type: integer
          default: 355
          description: The participant ID of the winner
        relationships:
          properties:
            player1:
              properties:
                data:
                  properties:
                    id:
                      type: string
                      default: '355'
                    type:
                      type: string
                      default: participant
                  x-apidog-orders:
                    - id
                    - type
                  type: object
                  x-apidog-ignore-properties: []
              x-apidog-orders:
                - data
              type: object
              x-apidog-ignore-properties: []
            player2:
              properties:
                data:
                  properties:
                    id:
                      type: string
                      default: '354'
                    type:
                      type: string
                      default: participant
                  x-apidog-orders:
                    - id
                    - type
                  type: object
                  x-apidog-ignore-properties: []
              x-apidog-orders:
                - data
              type: object
              x-apidog-ignore-properties: []
          x-apidog-orders:
            - player1
            - player2
          type: object
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - state
        - round
        - identifier
        - suggested_play_order
        - scores
        - score_in_sets
        - points_by_participant
        - timestamps
        - winner_id
        - relationships
      type: object
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
    ErrorModel:
      allOf:
        - type: object
          properties:
            detail:
              type: string
              description: Explanation of the error
            status:
              type: integer
              description: HTTP error code
            source:
              type: object
              properties:
                pointer:
                  type: string
                  description: What attribute caused the error
              x-apidog-orders:
                - pointer
              x-apidog-ignore-properties: []
          x-apidog-orders:
            - detail
            - status
            - source
          x-apidog-ignore-properties: []
      x-apidog-folder: ''
  securitySchemes:
    api_key:
      in: header
      name: Authorization
      type: apikey
    challonge_oauth:
      type: oauth2
      appName: Development Environment
      grantType: authorization_code
      flows:
        authorizationCode:
          authorizationUrl: https://api.challonge.com/oauth/authorize
          tokenUrl: https://api.challonge.com/oauth/token
          scopes:
            me: Read details about the user
            tournaments:read: Read all of the user's tournaments
            tournaments:write: Create, update and delete any of the user's tournaments
            matches:read: Read matches associated with the user's tournaments
            matches:write: Update matches associated with the user's tournaments
            attachments:read: Read match attachments associated with the user's tournaments
            attachments:write: >-
              Create, update and delete match attachments associated with the
              user's tournaments
            participants:read: Read participants associated with the user's tournaments
            participants:write: >-
              Create, update and delete participants associated with the user's
              tournaments
            communities:manage: Access resources belonging to communities that a user administers
            application:organizer: >-
              Full access to the user's resources that are associated with your
              application
            application:player: >-
              Read the user's resources that are associated with your
              application, register them for tournaments, and report their
              scores
            application:manage: >-
              Full access to all tournaments connected to your app. This scope
              can only be obtained via the client credentials flow and should be
              carefully protected.
          x-apidog:
            addTokenTo: header
            useTokenType: access_token
            queryParamKey: access_token
            headerKey: Authorization
            headerPrefix: Bearer
            challengeAlgorithm: S256
            clientAuthentication: header
            useTokenConfigAsRefreshTokenConfig: true
            redirectUri: https://app.apidog.com/oauth2-browser-callback.html
    api_key1:
      in: header
      name: Authorization
      type: apikey
    challonge_oauth1:
      type: oauth2
      appName: Development Environment
      grantType: authorization_code
      flows:
        authorizationCode:
          authorizationUrl: https://api.challonge.com/oauth/authorize
          tokenUrl: https://api.challonge.com/oauth/token
          scopes:
            me: Read details about the user
            application:organizer: >-
              Full access to the user's resources that are associated with your
              application
            application:player: >-
              Read the user's resources that are associated with your
              application, register them for tournaments, and report their
              scores
            tournaments:read: Read all of the user's tournaments
            tournaments:write: Create, update and delete any of the user's tournaments
            matches:read: Read matches associated with the user's tournaments
            matches:write: Update matches associated with the user's tournaments
            attachments:read: Read match attachments associated with the user's tournaments
            attachments:write: >-
              Create, update and delete match attachments associated with the
              user's tournaments
            participants:read: Read participants associated with the user's tournaments
            participants:write: >-
              Create, update and delete participants associated with the user's
              tournaments
            communities:manage: Read and manage communities that the user belongs to
    API Key:
      type: apikey
      in: query
      name: api_key
servers:
  - url: https://api.challonge.com/v2.1
    description: https://api.challonge.com/v2.1
security: []

```