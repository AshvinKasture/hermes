# ── Frontend builder ──
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --include=dev
COPY frontend/ ./
RUN npm run build

# ── Backend builder ──
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-builder
WORKDIR /app/backend
COPY backend/FiddleApi.csproj ./
RUN dotnet restore
COPY backend/ ./
RUN dotnet publish -c Release -o /app/publish --no-restore

# Pre-restore + pre-build the run-template so each submitted run only needs `dotnet build --no-restore`,
# not a full NuGet restore (NuGet packages get cached into this image's dotnet package cache below).
RUN dotnet build /app/backend/run-template/run.csproj -c Release

# ── Runtime ──
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS runtime
# We use the SDK (not just aspnet runtime) image because user-submitted code is compiled with
# `dotnet build`/`dotnet run` at request time - the full SDK must be present in the container.

# netcoredbg: MIT-licensed, DAP-speaking debugger for CoreCLR (Samsung/netcoredbg). Pinned to a
# known release tag rather than "latest" so a build doesn't silently pick up a new version.
ARG NETCOREDBG_VERSION=3.1.0-1031
RUN curl -fsSL "https://github.com/Samsung/netcoredbg/releases/download/${NETCOREDBG_VERSION}/netcoredbg-linux-amd64.tar.gz" \
      -o /tmp/netcoredbg.tar.gz \
    && mkdir -p /opt/netcoredbg-dist \
    && tar -xzf /tmp/netcoredbg.tar.gz -C /opt/netcoredbg-dist \
    && rm /tmp/netcoredbg.tar.gz

RUN addgroup --gid 1501 fiddleapp && adduser --uid 1501 --gid 1501 --disabled-password --gecos "" fiddleapp

WORKDIR /app

COPY --from=backend-builder /app/publish ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY --from=backend-builder /app/backend/run-template ./run-template

# Pre-seed the NuGet package cache + obj/bin for the run-template so first real user run is fast.
COPY --from=backend-builder /root/.nuget/packages /home/fiddleapp/.nuget/packages
RUN mkdir -p /tmp/fiddle-runs /data/saved-programs && chown -R fiddleapp:fiddleapp /app /tmp/fiddle-runs /data /home/fiddleapp

USER fiddleapp
ENV HOME=/home/fiddleapp
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
ENV DOTNET_NOLOGO=1
ENV FRONTEND_DIST=/app/frontend/dist
ENV RUN_TEMPLATE_DIR=/app/run-template
ENV RUN_SCRATCH_DIR=/tmp/fiddle-runs
ENV NETCOREDBG_PATH=/opt/netcoredbg-dist/netcoredbg/netcoredbg
ENV SAVED_PROGRAMS_DIR=/data/saved-programs
ENV ASPNETCORE_URLS=http://+:9121

EXPOSE 9121

CMD ["dotnet", "backend/FiddleApi.dll"]
