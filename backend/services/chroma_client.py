"""
ChromaDB client and vector search utilities.
Uses sentence-transformers for local embeddings (no API cost).
Supports both local PersistentClient and ChromaDB Cloud (when CHROMA_API_KEY is set).
"""
import logging
from typing import List, Dict, Any

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

from config import settings

logger = logging.getLogger(__name__)

# Embedding model — 384-dim, runs locally, no API key needed
_EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_COLLECTION_NAME = "knowledge_base"

# Lazy-loaded singletons
_chroma_client = None
_embed_model: SentenceTransformer = None
_collection = None


def _get_embed_model() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        logger.info("Loading embedding model: %s", _EMBED_MODEL_NAME)
        _embed_model = SentenceTransformer(_EMBED_MODEL_NAME)
    return _embed_model


def _get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        if settings.CHROMA_API_KEY:
            # ChromaDB Cloud — CloudClient auto-reads CHROMA_* env vars
            logger.info(
                "Connecting to ChromaDB Cloud (tenant=%s, database=%s)",
                settings.CHROMA_TENANT,
                settings.CHROMA_DATABASE,
            )
            _chroma_client = chromadb.CloudClient(
                tenant=settings.CHROMA_TENANT,
                database=settings.CHROMA_DATABASE,
                api_key=settings.CHROMA_API_KEY,
            )
        else:
            # Local persistent storage
            logger.info("Using local ChromaDB at %s", settings.CHROMA_PATH)
            _chroma_client = chromadb.PersistentClient(
                path=settings.CHROMA_PATH,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
    return _chroma_client


def get_collection():
    global _collection
    if _collection is None:
        client = _get_chroma_client()
        _collection = client.get_or_create_collection(
            name=_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a list of texts using the local sentence-transformers model."""
    model = _get_embed_model()
    embeddings = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return embeddings.tolist()


def add_chunks(
    chunks: List[str],
    metadatas: List[Dict[str, Any]],
    ids: List[str],
) -> None:
    """
    Add text chunks to ChromaDB.

    Args:
        chunks:    List of text strings to store.
        metadatas: List of metadata dicts (source_file, category, chunk_index).
        ids:       Unique string IDs for each chunk.
    """
    collection = get_collection()
    embeddings = embed_texts(chunks)
    collection.upsert(
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids,
    )
    logger.info("Upserted %d chunks into ChromaDB", len(chunks))


def similarity_search(query: str, n_results: int = 3) -> List[Dict[str, Any]]:
    """
    Retrieve the top-n most similar KB chunks for a query.

    Returns:
        List of dicts with keys: document, metadata, distance, id
    """
    collection = get_collection()

    # Check if collection has any documents
    count = collection.count()
    if count == 0:
        logger.warning("ChromaDB collection is empty — no KB chunks loaded")
        return []

    query_embedding = embed_texts([query])[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, count),
        include=["documents", "metadatas", "distances"],
    )

    output = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]
    ids = results.get("ids", [[]])[0]

    for doc, meta, dist, chunk_id in zip(docs, metas, dists, ids):
        output.append({
            "document": doc,
            "metadata": meta,
            "distance": dist,
            "id": chunk_id,
        })

    return output


def delete_document_chunks(source_file: str) -> None:
    """Remove all chunks belonging to a specific source document."""
    collection = get_collection()
    collection.delete(where={"source_file": source_file})
    logger.info("Deleted chunks for document: %s", source_file)
