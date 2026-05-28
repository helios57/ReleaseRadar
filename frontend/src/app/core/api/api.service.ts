import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Lock, Product, Rollout, RolloutType, SessionUser } from '../models/rollout.models';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  me(): Observable<SessionUser> {
    return this.http.get<SessionUser>(`${API}/me`);
  }

  products(): Observable<Product[]> {
    return this.http.get<Product[]>(`${API}/products`);
  }

  upsertProduct(body: Product): Observable<Product> {
    return this.http.post<Product>(`${API}/products`, body);
  }

  rolloutTypes(): Observable<RolloutType[]> {
    return this.http.get<RolloutType[]>(`${API}/rollout-types`);
  }

  upsertRolloutType(body: RolloutType): Observable<RolloutType> {
    return this.http.post<RolloutType>(`${API}/rollout-types`, body);
  }

  rollouts(): Observable<Rollout[]> {
    return this.http.get<Rollout[]>(`${API}/rollouts`);
  }

  rollout(id: string): Observable<Rollout> {
    return this.http.get<Rollout>(`${API}/rollouts/${id}`);
  }

  createRollout(body: Partial<Rollout>): Observable<Rollout> {
    return this.http.post<Rollout>(`${API}/rollouts`, body);
  }

  updateRollout(id: string, body: Partial<Rollout>): Observable<Rollout> {
    return this.http.patch<Rollout>(`${API}/rollouts/${id}`, body);
  }

  deleteRollout(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/rollouts/${id}`);
  }

  updateTask(
    id: string,
    seq: number,
    body: { status: string; reason: string },
  ): Observable<void> {
    return this.http.patch<void>(`${API}/rollouts/${id}/tasks/${seq}`, body);
  }

  locks(): Observable<Lock[]> {
    return this.http.get<Lock[]>(`${API}/locks`);
  }

  createLock(body: Partial<Lock>): Observable<Lock> {
    return this.http.post<Lock>(`${API}/locks`, body);
  }

  updateLock(id: string, body: Partial<Lock>): Observable<Lock> {
    return this.http.patch<Lock>(`${API}/locks/${id}`, body);
  }

  deleteLock(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/locks/${id}`);
  }
}
